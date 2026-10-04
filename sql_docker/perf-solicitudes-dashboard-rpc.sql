-- ============================================================
-- PERF: Solicitudes y dashboard del profesional en menos round-trips
--
-- 1) my_bookings(as_role): reemplaza "SELECT bookings" + "SELECT profiles_public
--    .in(ids)" (2 requests encadenadas) por una sola llamada que devuelve cada
--    reserva propia ya unida con el servicio y el nombre de la contraparte.
--    Solo devuelve reservas donde el usuario actual participa y solo el nombre
--    de la otra parte de ESAS reservas.
--
-- 2) dashboard_market_stats(): reemplaza la descarga de TODA professional_ratings
--    y de TODOS los services activos (promediados en el cliente) por los dos
--    agregados que el dashboard necesita: promedio de calificación del mercado y
--    precio promedio por categoría, ambos excluyendo al usuario actual.
--
-- security definer porque profiles/professional_profiles tienen RLS restrictivo;
-- search_path fijo; solo authenticated (sin acceso anon).
-- ============================================================

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
  order by b.created_at desc;
end;
$$;

revoke all on function public.my_bookings(text) from public, anon;
grant execute on function public.my_bookings(text) to authenticated;

create or replace function public.dashboard_market_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'market_rating_avg',
      (select avg(pr.rating_avg) from public.professional_ratings pr where pr.professional_id <> auth.uid()),
    'price_by_category',
      coalesce((
        select jsonb_agg(jsonb_build_object('category_id', t.category_id, 'avg_price', t.avg_price))
        from (
          select s.category_id, avg(s.price) as avg_price
          from public.services s
          where s.is_active and s.professional_id <> auth.uid()
          group by s.category_id
        ) t
      ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_market_stats() from public, anon;
grant execute on function public.dashboard_market_stats() to authenticated;
