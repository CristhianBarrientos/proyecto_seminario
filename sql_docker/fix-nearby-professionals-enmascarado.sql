-- ============================================================
-- FIX #31: nearby_professionals() permitia trilateracion
--
-- Problema (fix-nearby-professionals-rpc.sql): la RPC devolvia distance_km con precision completa
-- calculada desde un punto que manda el propio caller, con EXECUTE para anon y sin tope de radio ni
-- LIMIT. Tres llamadas desde tres puntos cercanos resuelven la ubicacion exacta del profesional
-- (trilateracion), y radius_km = 1000000 devolvia toda la tabla de una vez.
--
-- Redondear la distancia a buckets NO alcanza: moviendo el punto de consulta se encuentra la
-- frontera de cada bucket y con tres fronteras se recupera el centro igual. Por eso aqui se
-- ENMASCARA LA UBICACION, no solo la distancia:
--   * La ubicacion se ajusta a una cuadricula de 0.01 grados (~1.1 km) con ST_SnapToGrid.
--   * Tanto el filtro por radio como la distancia usan ese punto ajustado. Si el filtro usara la
--     ubicacion real, sondear el borde del radio filtraria la posicion exacta aunque la distancia
--     devuelta estuviera enmascarada.
--   Una trilateracion perfecta solo recupera el nodo de la cuadricula (barrio, +-~0.55 km por eje).
--
-- Ademas:
--   * Se revoca EXECUTE a anon y PUBLIC; queda solo authenticated (y se exige auth.uid()).
--   * radius_km se acota a [0, 50] y se devuelven como maximo 50 filas.
--   * Se validan lat/lng.
--   * Limite de 30 llamadas por minuto por usuario (ventana fija de 1 minuto). Frena el scripteo
--     desde UNA cuenta; no sustituye al #5: con signup abierto y autoconfirm se pueden crear
--     cuentas nuevas, pero el enmascarado ya acota lo que cada cuenta puede aprender.
--
-- Misma firma y mismas columnas que antes (distance_km ahora es la distancia al punto enmascarado,
-- redondeada a 0.1 km), asi que no rompe a nadie. El front no la usa hoy. Al escribir el contador
-- la funcion pasa de STABLE a VOLATILE: supabase.rpc usa POST, que es lo que PostgREST exige para
-- funciones volatiles.
--
-- Idempotente: se puede aplicar mas de una vez.
-- ============================================================

-- Contadores del limite. Sin acceso directo para anon/authenticated (RLS sin politicas + revoke):
-- solo la funcion (security definer, dueña de la tabla) los toca.
create table if not exists public.rpc_rate_limit (
  user_id uuid not null references auth.users(id) on delete cascade,
  fn text not null,
  window_start timestamptz not null,
  calls integer not null default 0,
  primary key (user_id, fn, window_start)
);

alter table public.rpc_rate_limit enable row level security;
revoke all on public.rpc_rate_limit from anon, authenticated;

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
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
  caller_point geography;
  capped_radius_km double precision;
  window_calls integer;
  max_calls_per_minute constant integer := 30;
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'Coordenadas invalidas';
  end if;

  -- Limite por usuario. El INSERT ... ON CONFLICT es atomico por fila, asi que dos llamadas
  -- concurrentes no se saltan el tope. Si se excede, el RAISE revierte el incremento: el contador
  -- se queda en el maximo y las siguientes del mismo minuto siguen rechazadas.
  insert into public.rpc_rate_limit as r (user_id, fn, window_start, calls)
  values (uid, 'nearby_professionals', date_trunc('minute', now()), 1)
  on conflict (user_id, fn, window_start) do update set calls = r.calls + 1
  returning r.calls into window_calls;

  if window_calls > max_calls_per_minute then
    raise exception 'Demasiadas consultas, intenta de nuevo en un minuto' using errcode = '54000';
  end if;

  -- Limpieza oportunista: solo cuando se abre una ventana nueva para este usuario.
  if window_calls = 1 then
    delete from public.rpc_rate_limit where window_start < now() - interval '1 hour';
  end if;

  caller_point := ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
  capped_radius_km := least(greatest(coalesce(radius_km, 10), 0), 50);

  return query
  select
    m.profile_id,
    m.bio,
    m.service_radius_km,
    m.is_verified,
    m.created_at,
    round((ST_Distance(m.masked_location, caller_point) / 1000.0)::numeric, 1)::double precision
  from (
    select
      pp.profile_id,
      pp.bio,
      pp.service_radius_km,
      pp.is_verified,
      pp.created_at,
      ST_SnapToGrid(pp.location::geometry, 0.01)::geography as masked_location
    from public.professional_profiles pp
    where pp.location is not null
  ) m
  where ST_DWithin(m.masked_location, caller_point, capped_radius_km * 1000)
  order by ST_Distance(m.masked_location, caller_point) asc, m.profile_id
  limit 50;
end;
$$;

-- Los permisos de una funcion se heredan al reemplazarla: se fijan explicitamente.
revoke all on function public.nearby_professionals(double precision, double precision, double precision)
  from public, anon;
grant execute on function public.nearby_professionals(double precision, double precision, double precision)
  to authenticated;
