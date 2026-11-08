-- ============================================================
-- SEC-02: profiles.role debe ser inmutable para los usuarios.
--
-- Hallazgo (plan de pruebas, iteración 1b): un cliente autenticado puede
-- cambiarse a 'profesional' con PATCH /rest/v1/profiles?id=eq.<su id>
-- (HTTP 200). La policy profiles_update_own solo comprueba id = auth.uid()
-- y `authenticated` tiene UPDATE sobre toda la tabla.
--
-- Por que un trigger y no REVOKE UPDATE (role): en Supabase `anon` y
-- `authenticated` tienen UPDATE a nivel de TABLA sobre public.profiles; un
-- REVOKE de columna no quita un privilegio concedido a nivel de tabla, asi
-- que seria un no-op. El trigger no depende de los grants.
--
-- Alcance real: ninguna policy de RLS depende de profiles.role y my_bookings
-- no se fia de el, asi que no es una escalada de acceso a datos ajenos. Es
-- integridad de identidad: la UI decide pestañas y la tarjeta de reputacion
-- segun el rol, y profiles_public lo expone. El rol se elige UNA vez en el
-- alta (handle_new_user, fix-signup-orfano.sql) y no hay pantalla para
-- cambiarlo. Si en el futuro se quiere permitir cambiar de rol, debe ser
-- por una RPC explicita, no por PATCH directo.
--
-- Quien puede cambiarlo: roles de administracion (postgres, service_role,
-- supabase_admin, Studio). Se bloquea solo cuando la sesion corre como
-- `anon` o `authenticated` (lo que PostgREST fija con SET ROLE). Se usa
-- current_user y no auth.role(): no depende de claims del JWT y el trigger
-- no necesita SECURITY DEFINER (evita el problema de search_path).
--
-- Idempotente: se puede correr varias veces.
-- ============================================================

begin;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('anon', 'authenticated') then
    raise exception 'El rol de la cuenta no se puede cambiar'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_guard on public.profiles;

create trigger protect_profile_role_guard
before update of role on public.profiles
for each row execute function public.protect_profile_role();

commit;
