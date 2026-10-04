-- ============================================================
-- FEATURE: chat cliente <-> profesional, un hilo por reserva
--
-- Reglas:
--  * Solo los dos participantes de la reserva leen y escriben.
--  * sender_id debe ser quien envía (RLS + trigger); body de 1 a 2000 chars.
--  * No se escribe en reservas canceladas.
--  * Anti-spam: máximo 20 mensajes por minuto por usuario.
--  * Los mensajes no se editan ni se borran. El destinatario solo puede
--    actualizar read_at (grant por columna + policy que excluye al emisor).
--  * Cada mensaje genera una notificación (tipo new_message) al otro
--    participante, salvo que ya tenga una sin leer de esa misma reserva
--    (evita inundar la bandeja durante una conversación activa).
--  * Depende de sql_docker/feature-notifications.sql (tabla notifications y
--    publicación supabase_realtime).
-- ============================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_booking_created_idx on public.messages (booking_id, created_at);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = messages.booking_id and auth.uid() in (b.client_id, b.professional_id)
  ));

drop policy if exists messages_insert_participants on public.messages;
create policy messages_insert_participants
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = messages.booking_id and auth.uid() in (b.client_id, b.professional_id)
    )
  );

drop policy if exists messages_update_read_by_recipient on public.messages;
create policy messages_update_read_by_recipient
  on public.messages for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = messages.booking_id and auth.uid() in (b.client_id, b.professional_id)
    )
  )
  with check (sender_id <> auth.uid());

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- ------------------------------------------------------------
-- Guarda de inserción (antes de insertar).
-- ------------------------------------------------------------
create or replace function public.validate_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  b public.bookings;
begin
  new.body := btrim(new.body);
  if char_length(new.body) = 0 then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  select * into b from public.bookings where id = new.booking_id;
  if b is null then
    raise exception 'La reserva no existe';
  end if;
  if new.sender_id not in (b.client_id, b.professional_id) then
    raise exception 'Solo los participantes de la reserva pueden enviar mensajes';
  end if;
  if b.status = 'cancelado' then
    raise exception 'No se puede enviar mensajes en una reserva cancelada';
  end if;

  if (select count(*) from public.messages m
      where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Estás enviando mensajes muy rápido. Esperá un momento.';
  end if;

  new.read_at := null;
  return new;
end;
$$;

drop trigger if exists message_insert_guard on public.messages;
create trigger message_insert_guard
  before insert on public.messages
  for each row execute function public.validate_message_insert();

-- ------------------------------------------------------------
-- Notificación al destinatario (después de insertar).
-- ------------------------------------------------------------
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  b public.bookings;
  recipient uuid;
  sender_name text;
begin
  select * into b from public.bookings where id = new.booking_id;
  recipient := case when new.sender_id = b.client_id then b.professional_id else b.client_id end;

  if exists (
    select 1 from public.notifications n
    where n.user_id = recipient and n.booking_id = new.booking_id
      and n.type = 'new_message' and n.read_at is null
  ) then
    return new;
  end if;

  select full_name into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, type, booking_id, title, body)
  values (recipient, 'new_message', new.booking_id, 'Nuevo mensaje',
          coalesce(sender_name, 'Alguien') || ': ' || left(new.body, 80));
  return new;
end;
$$;

drop trigger if exists message_notify on public.messages;
create trigger message_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- ------------------------------------------------------------
-- Realtime (idempotente).
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
