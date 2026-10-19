-- ============================================================
-- FEATURE: notificaciones push (FCM) para el APK Android
--
-- Flujo: INSERT en public.notifications -> trigger -> pg_net -> Edge Function
-- `send-push` (http://functions:9000/send-push) -> FCM HTTP v1 -> dispositivo.
--
-- * device_tokens: un token FCM pertenece a UN usuario. Los clientes NO pueden
--   insertar/actualizar directo: lo hacen por register_device_token(), que
--   reasigna el token si otra cuenta inicia sesion en el mismo telefono (si no,
--   el usuario nuevo recibiria los push del anterior).
-- * El secreto compartido trigger -> funcion se genera AQUI dentro, en Vault
--   (nunca queda en el repo). Se lee una vez y se copia a PUSH_WEBHOOK_SECRET
--   del contenedor de funciones:
--     select decrypted_secret from vault.decrypted_secrets
--     where name = 'push_webhook_secret';
-- * El trigger nunca debe romper el INSERT de la notificacion: cualquier error
--   (sin pg_net, sin secreto, funcion caida) queda como WARNING.
-- Idempotente: se puede aplicar varias veces.
-- ============================================================

-- ------------------------------------------------------------
-- Tokens de dispositivo.
-- ------------------------------------------------------------
create table if not exists public.device_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_select_own on public.device_tokens;
create policy device_tokens_select_own
  on public.device_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists device_tokens_delete_own on public.device_tokens;
create policy device_tokens_delete_own
  on public.device_tokens for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.device_tokens from anon, authenticated;
grant select, delete on public.device_tokens to authenticated;

-- ------------------------------------------------------------
-- Registro de token (upsert + reasignacion al usuario actual).
-- Tope de 10 dispositivos por usuario: se conservan los mas recientes.
-- ------------------------------------------------------------
create or replace function public.register_device_token(
  p_token text,
  p_platform text default 'android'
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 then
    raise exception 'Token invalido' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'Plataforma invalida' using errcode = '22023';
  end if;

  insert into public.device_tokens (token, user_id, platform)
  values (p_token, uid, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();

  delete from public.device_tokens
  where user_id = uid
    and token in (
      select token from public.device_tokens
      where user_id = uid
      order by updated_at desc
      offset 10
    );
end;
$$;

revoke all on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;

-- ------------------------------------------------------------
-- Secreto compartido (se crea una sola vez, valor aleatorio).
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_webhook_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'push_webhook_secret',
      'Secreto compartido trigger -> Edge Function send-push'
    );
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Trigger: cada notificacion nueva dispara el envio push (asincrono, via
-- pg_net: la peticion sale despues del commit). Solo si el usuario tiene
-- algun token registrado.
-- ------------------------------------------------------------
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  secret text;
begin
  if not exists (select 1 from public.device_tokens where user_id = new.user_id) then
    return new;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  if secret is null then
    raise warning 'push_on_notification: falta el secreto push_webhook_secret';
    return new;
  end if;

  perform net.http_post(
    url := 'http://functions:9000/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', secret
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'push_on_notification: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.push_on_notification() from public, anon, authenticated;

drop trigger if exists notification_push on public.notifications;
create trigger notification_push
  after insert on public.notifications
  for each row execute function public.push_on_notification();
