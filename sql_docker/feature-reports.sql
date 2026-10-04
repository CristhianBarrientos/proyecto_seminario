-- ============================================================
-- FEATURE: denuncias entre usuarios (cliente <-> profesional)
--
-- Reglas:
--  * Solo se puede denunciar a alguien con quien se compartió una reserva
--    (evita denuncias masivas/acoso a usuarios con los que no hubo trato).
--  * Si se indica booking_id, ambos deben ser participantes de esa reserva.
--  * Máximo 5 denuncias por usuario cada 24 h (anti-spam).
--  * Una denuncia abierta por (denunciante, denunciado, reserva).
--  * El denunciante solo ve las suyas; el denunciado NUNCA las ve.
--  * Los usuarios no pueden editar ni borrar: el estado lo cambia el
--    moderador (service_role / Studio), no la app.
-- ============================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  reported_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  reason text not null check (reason in
    ('fraude', 'acoso', 'servicio_no_prestado', 'contenido_inapropiado', 'suplantacion', 'otro')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'abierta'
    check (status in ('abierta', 'en_revision', 'resuelta', 'descartada')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create unique index if not exists reports_one_open_per_target
  on public.reports (reporter_id, reported_id, coalesce(booking_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('abierta', 'en_revision');

create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create index if not exists reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

revoke all on public.reports from anon, authenticated;
grant select, insert on public.reports to authenticated;

-- ------------------------------------------------------------
-- Guarda de inserción. status se fuerza a 'abierta' (el cliente no decide).
-- ------------------------------------------------------------
create or replace function public.validate_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  b public.bookings;
begin
  new.status := 'abierta';

  if new.booking_id is not null then
    select * into b from public.bookings where id = new.booking_id;
    if b is null then
      raise exception 'La reserva indicada no existe';
    end if;
    if not (
      (b.client_id = new.reporter_id and b.professional_id = new.reported_id) or
      (b.professional_id = new.reporter_id and b.client_id = new.reported_id)
    ) then
      raise exception 'Solo podés denunciar a la otra parte de una reserva en la que participás';
    end if;
  elsif not exists (
    select 1 from public.bookings x
    where (x.client_id = new.reporter_id and x.professional_id = new.reported_id)
       or (x.professional_id = new.reporter_id and x.client_id = new.reported_id)
  ) then
    raise exception 'Solo podés denunciar a usuarios con los que tuviste una reserva';
  end if;

  -- Serializa las denuncias del mismo usuario: sin este lock, INSERT concurrentes pasan todos
  -- el conteo antes de que alguno commitee y superan el limite.
  perform pg_advisory_xact_lock(hashtext('reports:' || new.reporter_id::text));

  if (select count(*) from public.reports r
      where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Alcanzaste el límite de denuncias por día. Intentá mañana.';
  end if;

  return new;
end;
$$;

drop trigger if exists report_insert_guard on public.reports;
create trigger report_insert_guard
  before insert on public.reports
  for each row execute function public.validate_report_insert();
