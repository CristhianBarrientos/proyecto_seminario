-- ============================================================
-- SEC-01 + datos sin limite (plan de pruebas, iteracion 1b)
--
-- 1) search_path fijo en las funciones de trigger de la app que no lo tenian.
--    protect_is_verified, validate_booking_update y validate_review_insert son
--    SECURITY DEFINER: sin search_path propio resuelven nombres con el de quien
--    llama, que permite suplantar objetos (tablas/funciones) creando uno con el
--    mismo nombre en un esquema que el llamador controle antes en el path.
--    touch_review_updated_at no es DEFINER, pero se fija igual por consistencia.
--    Las cuatro ya usan nombres calificados (public.*, auth.*), por eso basta
--    con search_path vacio; se verifica con pruebas de cada trigger.
--    (Las funciones de PostGIS que aparecen sin search_path son de la extension,
--    no del proyecto, y no se tocan.)
--
-- 2) Limites de longitud (CHECK) en las columnas de texto que aceptaban 100 000
--    caracteres por la API, y lista cerrada para services.price_unit.
--    Los valores de price_unit son los de PRICE_UNITS en
--    app-servicios/src/lib/constants.ts (servicio, hora, dia, m2); si se agrega
--    una unidad en el front hay que agregarla aqui.
--
--    Los limites se agregan como NOT VALID y luego se validan en la MISMA
--    transaccion: si ya hubiera filas que los violen (otro entorno), todo hace
--    rollback y el error nombra la restriccion, sin dejar el esquema a medias.
--    Las columnas son NULL-ables; un NULL siempre pasa.
--
-- Los topes se alinean con app-servicios/src/lib/limits.ts (maxlength de los
-- campos y largo maximo del nombre al registrarse). Si cambian aqui, cambian alla.
--
-- Idempotente: se puede correr varias veces.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) search_path
-- ------------------------------------------------------------
alter function public.protect_is_verified()      set search_path = '';
alter function public.validate_booking_update()  set search_path = '';
alter function public.validate_review_insert()   set search_path = '';
alter function public.touch_review_updated_at()  set search_path = '';

-- ------------------------------------------------------------
-- 2) Limites de longitud
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_full_name_len;
alter table public.profiles add constraint profiles_full_name_len
  check (full_name is null or char_length(full_name) <= 100) not valid;

alter table public.profiles drop constraint if exists profiles_phone_len;
alter table public.profiles add constraint profiles_phone_len
  check (phone is null or char_length(phone) <= 20) not valid;

alter table public.profiles drop constraint if exists profiles_avatar_url_len;
alter table public.profiles add constraint profiles_avatar_url_len
  check (avatar_url is null or char_length(avatar_url) <= 2048) not valid;

alter table public.bookings drop constraint if exists bookings_notes_len;
alter table public.bookings add constraint bookings_notes_len
  check (notes is null or char_length(notes) <= 500) not valid;

alter table public.professional_profiles drop constraint if exists professional_profiles_bio_len;
alter table public.professional_profiles add constraint professional_profiles_bio_len
  check (bio is null or char_length(bio) <= 1000) not valid;

alter table public.services drop constraint if exists services_title_len;
alter table public.services add constraint services_title_len
  check (title is null or char_length(title) <= 100) not valid;

alter table public.services drop constraint if exists services_description_len;
alter table public.services add constraint services_description_len
  check (description is null or char_length(description) <= 1000) not valid;

-- ------------------------------------------------------------
-- 3) price_unit: lista cerrada (mismos valores que PRICE_UNITS del front)
-- ------------------------------------------------------------
alter table public.services drop constraint if exists services_price_unit_valid;
alter table public.services add constraint services_price_unit_valid
  check (price_unit is null or price_unit in ('servicio', 'hora', 'dia', 'm2')) not valid;

-- ------------------------------------------------------------
-- Validar lo que ya existe (mismo bloque transaccional: todo o nada)
-- ------------------------------------------------------------
alter table public.profiles              validate constraint profiles_full_name_len;
alter table public.profiles              validate constraint profiles_phone_len;
alter table public.profiles              validate constraint profiles_avatar_url_len;
alter table public.bookings              validate constraint bookings_notes_len;
alter table public.professional_profiles validate constraint professional_profiles_bio_len;
alter table public.services              validate constraint services_title_len;
alter table public.services              validate constraint services_description_len;
alter table public.services              validate constraint services_price_unit_valid;

commit;
