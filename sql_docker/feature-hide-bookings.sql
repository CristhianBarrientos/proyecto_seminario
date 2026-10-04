-- ============================================================
-- FEATURE: ocultar solicitudes (y su chat) de mi lista - eliminación lógica por usuario
--
-- Una reserva la comparten cliente y profesional, así que "eliminar" NO borra la fila
-- (el on delete cascade se llevaría mensajes, reseñas y denuncias, que son evidencia).
-- Cada usuario oculta la reserva SOLO de su lista; la otra parte la sigue viendo.
--
-- Reglas:
--  * Solo se ocultan reservas terminales (cancelado / completado): una solicitud
--    activa es una obligación pendiente y no se puede esconder.
--  * Solo participantes de la reserva (client_id o professional_id).
--  * Máximo 100 ids por llamada.
--  * Una reserva oculta no reaparece aunque llegue un mensaje nuevo (la notificación
--    sigue llegando; el chat queda inaccesible desde la lista).
--
-- booking_hidden no tiene acceso directo para anon/authenticated (RLS sin policies +
-- revoke): todo pasa por hide_bookings() y my_bookings() (security definer).
-- Reemplaza my_bookings(text) de perf-solicitudes-dashboard-rpc.sql (misma firma,
-- ahora excluye las reservas ocultas del usuario actual).
-- ============================================================

create table if not exists public.booking_hidden (
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, booking_id)
);

alter table public.booking_hidden enable row level security;
revoke all on public.booking_hidden from anon, authenticated;

-- ------------------------------------------------------------
-- hide_bookings(ids): oculta las reservas indicadas para el usuario actual.
-- Devuelve cuántas quedaron ocultas ahora (las ya ocultas no cuentan).
-- ------------------------------------------------------------
create or replace function public.hide_bookings(booking_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
  hidden_count integer;
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;
  if booking_ids is null or coalesce(array_length(booking_ids, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(booking_ids, 1) > 100 then
    raise exception 'No se pueden ocultar más de 100 solicitudes a la vez';
  end if;

  if exists (
    select 1
    from unnest(booking_ids) as t(id)
    left join public.bookings b on b.id = t.id
    where b.id is null
       or uid not in (b.client_id, b.professional_id)
       or b.status not in ('cancelado', 'completado')
  ) then
    raise exception 'Solo podés ocultar solicitudes propias que estén canceladas o completadas';
  end if;

  insert into public.booking_hidden (user_id, booking_id)
  select uid, t.id from unnest(booking_ids) as t(id)
  on conflict do nothing;
  get diagnostics hidden_count = row_count;

  return hidden_count;
end;
$$;

revoke all on function public.hide_bookings(uuid[]) from public, anon;
grant execute on function public.hide_bookings(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- my_bookings: igual que antes, excluyendo las reservas que el usuario ocultó.
-- ------------------------------------------------------------
create or replace function public.my_bookings(as_role text)
returns table (
  id uuid,
  status public.booking_status,
  scheduled_at timestamptz,
  price_agreed numeric,
  notes text,
  created_at timestamptz,
  client_id uuid,
  professional_id uuid,
  service_title text,
  service_price_unit text,
  other_party_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if as_role not in ('client', 'professional') then
    raise exception 'as_role debe ser client o professional';
  end if;

  return query
  select
    b.id, b.status, b.scheduled_at, b.price_agreed, b.notes, b.created_at,
    b.client_id, b.professional_id,
    s.title, s.price_unit,
    p.full_name
  from public.bookings b
  left join public.services s on s.id = b.service_id
  left join public.profiles p
    on p.id = case when as_role = 'client' then b.professional_id else b.client_id end
  where (case when as_role = 'client' then b.client_id else b.professional_id end) = auth.uid()
    and not exists (
      select 1 from public.booking_hidden h
      where h.booking_id = b.id and h.user_id = auth.uid()
    )
  order by b.created_at desc;
end;
$$;

revoke all on function public.my_bookings(text) from public, anon;
grant execute on function public.my_bookings(text) to authenticated;
