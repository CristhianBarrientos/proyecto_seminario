-- ============================================================
-- PERF: feed de servicios en una sola consulta
-- Antes, Home hacía 2 oleadas secuenciales contra PostgREST:
--   1) services (+ categories)  2) professional_profiles_public + profiles_public
--      filtrados con .in(ids) (los ids viajaban en la URL).
-- Contra OCI cada oleada cuesta ~100+ ms, y la lista de ids en la URL no
-- escala. Esta función devuelve el feed ya unido en un solo round-trip.
--
-- Qué expone: exactamente lo que ya era público vía las vistas
-- profiles_public (id, full_name) y professional_profiles_public
-- (is_verified), más services/categories activos. No expone phone,
-- location ni verification_docs.
-- security definer porque professional_profiles/profiles tienen RLS
-- restrictivo; search_path fijo (recomendación estándar para definer).
-- ============================================================
create or replace function public.feed_services()
returns table (
  id uuid,
  title text,
  price numeric,
  price_unit text,
  category_id integer,
  category_name text,
  professional_id uuid,
  professional_name text,
  is_verified boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    s.id,
    s.title,
    s.price,
    s.price_unit,
    s.category_id,
    c.name,
    s.professional_id,
    p.full_name,
    coalesce(pp.is_verified, false)
  from public.services s
  left join public.categories c on c.id = s.category_id
  left join public.profiles p on p.id = s.professional_id
  left join public.professional_profiles pp on pp.profile_id = s.professional_id
  where s.is_active
  order by s.created_at desc;
$$;

grant execute on function public.feed_services() to authenticated;
