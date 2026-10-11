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
--
-- IMPORTANTE (#31): la RPC nearby_professionals YA NO VIVE EN ESTE ARCHIVO. La version original
-- (distancia exacta + EXECUTE a anon + sin tope = trilateracion) se retiro de aqui para que volver a
-- correr este script (p. ej. para reparar la vista) no reinstale la vulnerabilidad. La funcion se
-- define en fix-nearby-professionals-enmascarado.sql, que la crea si no existe: en un entorno nuevo
-- se aplican los dos, este primero.
--
-- #32: todo el script va en UNA transaccion. Antes eran sentencias DDL sueltas: si en un runner que
-- autocommitea cada sentencia fallaba el CREATE VIEW o un GRANT despues de que el DROP VIEW ya se
-- habia commiteado, la vista quedaba inexistente y Home.tsx/ProfessionalDetail (que hacen SELECT
-- sobre professional_profiles_public) fallaban hasta volver a correr el fix a mano. Con
-- BEGIN/COMMIT, si algo falla se revierte todo y la vista queda como estaba.
-- Verificado con `psql` normal: un GRANT que falla revierte tambien el DROP VIEW (la vista queda con
-- el mismo hash de definicion y los mismos permisos). Con `psql --single-transaction` el BEGIN/COMMIT
-- internos solo emiten warnings. NO se probo en el SQL Editor de Supabase Studio ni en otros runners
-- que envien sentencia por sentencia: ahi la transaccion podria no abarcar el script.
-- DROP VIEW toma un lock ACCESS EXCLUSIVE que se mantiene hasta el COMMIT; es breve (DDL de una
-- vista), pero las lecturas de la vista esperan mientras dura.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Vista pública sin location.
-- NOTA: no se puede usar CREATE OR REPLACE VIEW porque Postgres no
-- permite eliminar columnas de una vista existente (error: "cannot
-- drop columns from view") — hay que dropearla y recrearla. Verificado
-- que ninguna otra vista depende de professional_profiles_public antes
-- de dropearla.
-- ------------------------------------------------------------
drop view if exists public.professional_profiles_public;

create view public.professional_profiles_public
  with (security_invoker='false') as
select profile_id, bio, service_radius_km, is_verified, created_at
from public.professional_profiles;

grant select on public.professional_profiles_public to authenticated, anon;

-- ------------------------------------------------------------
-- 2. (retirada) La RPC de distancia se movio a fix-nearby-professionals-enmascarado.sql (#31).
-- ------------------------------------------------------------

commit;
