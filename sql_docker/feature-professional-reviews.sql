-- ============================================================
-- FEATURE: reseñas de clientes a profesionales (pantalla de calificar + lista en el perfil)
--
-- La tabla public.reviews, su guarda de insercion (solo un booking PROPIO y COMPLETADO, una vez por
-- booking) y las politicas de editar/borrar del dueño ya existian (schema-inicial, fix-rls-hallazgos-criticos,
-- fix-reviews-owner-policies). Faltaba exponerlo con la privacidad correcta. Este script:
--
--  1. Limita el comentario a 1..500 caracteres (igual que client_reviews). NOT VALID + validacion: no rompe
--     filas viejas y valida las nuevas/editadas.
--  2. professional_ratings pasa a security_invoker=false. Es un agregado (promedio y cantidad por profesional)
--     sin datos personales; asi el promedio de estrellas sigue visible para todos aunque la tabla base se cierre
--     (en algunos entornos la vista estaba con security_invoker=true y habria dejado de funcionar).
--  3. Cierra la LECTURA PUBLICA de la tabla reviews: antes cualquiera, incluso sin cuenta, podia leerla entera
--     (con client_id, booking_id y comentario). Ahora cada parte ve solo las suyas; el resto se lee por la
--     funcion de abajo, que no expone ids de personas.
--  4. display_short_name(): "María Cliente Demo" -> "María D." (nombre y la inicial del ultimo apellido).
--  5. professional_reviews(): lista paginada de las reseñas de un profesional para usuarios con sesion, con el
--     nombre del autor abreviado, el servicio y si la reseña es mia. No devuelve client_id ni booking_id.
--
-- Idempotente: se puede aplicar varias veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Comentario acotado
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_comment_len' and conrelid = 'public.reviews'::regclass) then
    alter table public.reviews
      add constraint reviews_comment_len
      check (comment is null or char_length(btrim(comment)) between 1 and 500) not valid;
  end if;

  begin
    alter table public.reviews validate constraint reviews_comment_len;
  exception when check_violation then
    raise warning 'reviews_comment_len: hay comentarios viejos fuera de 1..500 caracteres; la restriccion queda activa solo para filas nuevas o editadas';
  end;
end;
$$;

-- ------------------------------------------------------------
-- 2. Promedios: agregado sin datos personales, independiente de la RLS de la tabla base
-- ------------------------------------------------------------
alter view public.professional_ratings set (security_invoker = false);

-- ------------------------------------------------------------
-- 3. Lectura de reviews solo para las partes
-- ------------------------------------------------------------
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_public" on public.reviews;

drop policy if exists reviews_select_involved on public.reviews;
create policy reviews_select_involved
  on public.reviews for select to authenticated
  using (client_id = auth.uid() or professional_id = auth.uid());

-- ------------------------------------------------------------
-- 4. Nombre abreviado para mostrar al autor de una reseña
-- ------------------------------------------------------------
create or replace function public.display_short_name(p_full_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when a[1] is null or a[1] = '' then 'Usuario'
    when array_length(a, 1) = 1 then a[1]
    else a[1] || ' ' || upper(left(a[array_length(a, 1)], 1)) || '.'
  end
  from (select regexp_split_to_array(btrim(coalesce(p_full_name, '')), '\s+') as a) s
$$;

-- ------------------------------------------------------------
-- 5. Reseñas de un profesional (paginadas por fecha, mas nuevas primero)
-- ------------------------------------------------------------
create or replace function public.professional_reviews(
  p_professional_id uuid,
  p_limit int default 20,
  p_before timestamptz default null
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewer_name text,
  service_title text,
  is_mine boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.created_at,
    r.updated_at,
    public.display_short_name(p.full_name) as reviewer_name,
    s.title as service_title,
    (r.client_id = auth.uid()) as is_mine
  from public.reviews r
  join public.profiles p on p.id = r.client_id
  left join public.bookings b on b.id = r.booking_id
  left join public.services s on s.id = b.service_id
  where r.professional_id = p_professional_id
    and (p_before is null or r.created_at < p_before)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

revoke all on function public.professional_reviews(uuid, int, timestamptz) from public, anon;
grant execute on function public.professional_reviews(uuid, int, timestamptz) to authenticated;
