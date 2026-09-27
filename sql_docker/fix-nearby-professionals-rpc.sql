-- ============================================================
-- FIX: riesgo residual documentado en fix-rls-hallazgos-criticos.sql (#3)
-- professional_profiles_public exponía location (lat/lng exacta) a
-- cualquier usuario autenticado/anon porque el feed la necesitaba para
-- "cerca de mí". Esa funcionalidad nunca llegó a usar la columna en el
-- frontend (Home.tsx solo lee profile_id/is_verified de la vista), así
-- que quedaba una fuga de coordenadas exactas sin beneficio real.
--
-- Reemplazo: función RPC server-side con ST_DWithin que devuelve
-- distancia (km) en vez de coordenadas crudas, y la vista pública deja
-- de exponer location.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vista pública sin location.
-- ------------------------------------------------------------
create or replace view public.professional_profiles_public
  with (security_invoker='false') as
select profile_id, bio, service_radius_km, is_verified, created_at
from public.professional_profiles;

grant select on public.professional_profiles_public to authenticated, anon;

-- ------------------------------------------------------------
-- 2. RPC de distancia. security definer porque professional_profiles
--    tiene RLS restrictivo (solo el dueño lee su fila completa); esta
--    función controla exactamente qué se expone a terceros: distancia
--    calculada, nunca location en sí.
--    search_path fijo para evitar hijacking vía search_path del rol
--    que invoca la función (recomendación estándar para SECURITY DEFINER).
-- ------------------------------------------------------------
create or replace function public.nearby_professionals(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  profile_id uuid,
  bio text,
  service_radius_km numeric,
  is_verified boolean,
  created_at timestamptz,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    pp.profile_id,
    pp.bio,
    pp.service_radius_km,
    pp.is_verified,
    pp.created_at,
    ST_Distance(
      pp.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) / 1000.0 as distance_km
  from public.professional_profiles pp
  where pp.location is not null
    and ST_DWithin(
      pp.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_km * 1000
    )
  order by distance_km asc;
$$;

grant execute on function public.nearby_professionals(double precision, double precision, double precision)
  to authenticated, anon;
