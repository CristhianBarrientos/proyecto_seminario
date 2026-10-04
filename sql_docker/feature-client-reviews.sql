-- ============================================================
-- FEATURE: calificación de profesional -> cliente
-- Espejo de public.reviews (cliente -> profesional). Solo el profesional
-- de un booking COMPLETADO puede calificar a su cliente, una vez por
-- booking. Sin UPDATE/DELETE (la calificación es definitiva).
--
-- Visibilidad: cada parte ve las calificaciones donde participa. El
-- promedio por cliente se expone en client_ratings solo a usuarios
-- autenticados (los profesionales lo necesitan para decidir si aceptan
-- una solicitud); no se publica a anon ni se exponen comentarios.
-- ============================================================

create table if not exists public.client_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id),
  professional_id uuid not null references public.profiles(id),
  client_id uuid not null references public.profiles(id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists client_reviews_client_idx on public.client_reviews (client_id);

alter table public.client_reviews enable row level security;

drop policy if exists client_reviews_insert_own_professional on public.client_reviews;
create policy client_reviews_insert_own_professional
  on public.client_reviews for insert to authenticated
  with check (professional_id = auth.uid());

drop policy if exists client_reviews_select_involved on public.client_reviews;
create policy client_reviews_select_involved
  on public.client_reviews for select to authenticated
  using (professional_id = auth.uid() or client_id = auth.uid());

revoke all on public.client_reviews from anon, authenticated;
grant select, insert on public.client_reviews to authenticated;

-- ------------------------------------------------------------
-- Guarda: el booking debe existir, ser del profesional que califica,
-- apuntar al cliente correcto y estar completado. Se fija client_id
-- desde el booking (no se confía en el valor enviado).
-- ------------------------------------------------------------
create or replace function public.validate_client_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = new.booking_id;

  if b is null then
    raise exception 'booking_id no existe';
  end if;

  if b.professional_id <> new.professional_id then
    raise exception 'La calificación debe corresponder a un booking propio';
  end if;

  if b.client_id <> new.client_id then
    raise exception 'client_id no coincide con el del booking';
  end if;

  if b.status <> 'completado' then
    raise exception 'Solo se puede calificar un servicio completado';
  end if;

  return new;
end;
$$;

drop trigger if exists client_review_insert_guard on public.client_reviews;
create trigger client_review_insert_guard
  before insert on public.client_reviews
  for each row execute function public.validate_client_review_insert();

-- ------------------------------------------------------------
-- Promedio por cliente (solo autenticados, solo agregados).
-- security_invoker=false porque la tabla base tiene RLS por participante.
-- ------------------------------------------------------------
create or replace view public.client_ratings
  with (security_invoker = false) as
select
  client_id,
  round(avg(rating)::numeric, 2) as rating_avg,
  count(*) as rating_count
from public.client_reviews
group by client_id;

revoke all on public.client_ratings from anon, authenticated;
grant select on public.client_ratings to authenticated;
