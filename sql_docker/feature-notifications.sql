-- ============================================================
-- FEATURE: notificaciones in-app (solicitud nueva, cambios de estado)
--
-- Las filas las crean TRIGGERS (security definer) sobre bookings; los
-- usuarios no pueden insertar ni borrar notificaciones, solo leer las
-- suyas y marcarlas como leídas (grant de UPDATE solo sobre read_at).
--
-- Además se agregan bookings y notifications a la publicación
-- supabase_realtime: estaba VACÍA, así que ningún canal postgres_changes
-- de la app (bookings, dashboard del profesional) recibía eventos.
-- Realtime respeta RLS para suscriptores autenticados.
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('booking_requested', 'booking_status', 'new_message')),
  booking_id uuid references public.bookings(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------------
-- Nueva solicitud -> notifica al profesional.
-- ------------------------------------------------------------
create or replace function public.notify_booking_requested()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  client_name text;
  service_title text;
begin
  select full_name into client_name from public.profiles where id = new.client_id;
  select title into service_title from public.services where id = new.service_id;

  insert into public.notifications (user_id, type, booking_id, title, body)
  values (
    new.professional_id,
    'booking_requested',
    new.id,
    'Nueva solicitud',
    coalesce(client_name, 'Un cliente') || ' pidió: ' || coalesce(service_title, 'un servicio')
  );
  return new;
end;
$$;

drop trigger if exists booking_requested_notify on public.bookings;
create trigger booking_requested_notify
  after insert on public.bookings
  for each row execute function public.notify_booking_requested();

-- ------------------------------------------------------------
-- Cambio de estado -> notifica a la OTRA parte (la que no hizo el cambio).
-- Si no hay sesión de usuario (service_role/Studio) se notifica al cliente.
-- ------------------------------------------------------------
create or replace function public.notify_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  recipient uuid;
  service_title text;
  title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  recipient := case when actor = new.client_id then new.professional_id else new.client_id end;
  select s.title into service_title from public.services s where s.id = new.service_id;

  title := case new.status
    when 'aceptado' then 'Tu solicitud fue aceptada'
    when 'en_curso' then 'El trabajo comenzó'
    when 'completado' then 'Trabajo completado'
    when 'cancelado' then 'Solicitud cancelada'
    else 'Tu solicitud cambió de estado'
  end;

  insert into public.notifications (user_id, type, booking_id, title, body)
  values (recipient, 'booking_status', new.id, title, coalesce(service_title, 'Servicio'));
  return new;
end;
$$;

drop trigger if exists booking_status_notify on public.bookings;
create trigger booking_status_notify
  after update of status on public.bookings
  for each row execute function public.notify_booking_status();

-- ------------------------------------------------------------
-- Realtime: agregar las tablas a la publicación solo si faltan.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
