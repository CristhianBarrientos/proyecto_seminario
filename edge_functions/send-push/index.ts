// Edge Function `send-push`: envia una notificacion de public.notifications por FCM HTTP v1.
//
// La invoca el trigger public.push_on_notification (via pg_net) con el header `x-push-secret`.
// El runtime corre con VERIFY_JWT=false y /functions/v1/* es publico en el gateway, asi que
// el secreto compartido ES la autenticacion: sin el, 401.
//
// Variables de entorno (docker-compose, servicio `functions`):
//   PUSH_WEBHOOK_SECRET        = valor de vault 'push_webhook_secret'
//   FCM_SERVICE_ACCOUNT_B64    = service account de Firebase en base64 (SECRETO, nunca al repo)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ya las define el compose)
import * as jose from 'jsr:@panva/jose@6'

const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANDROID_CHANNEL_ID = 'yaquedo_default' // debe coincidir con el canal que crea la app
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri: string }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function loadServiceAccount(): ServiceAccount | null {
  const b64 = Deno.env.get('FCM_SERVICE_ACCOUNT_B64')
  if (!b64) return null
  try {
    const sa = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null
    return { ...sa, token_uri: sa.token_uri ?? 'https://oauth2.googleapis.com/token' }
  } catch {
    return null
  }
}

// Comparacion en tiempo constante (hash previo para igualar longitudes).
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await jose.importPKCS8(sa.private_key, 'RS256')
  const assertion = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri)
    .setIssuedAt()
    .setExpirationTime('55m')
    .sign(key)

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token as string
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(init.headers ?? {}) },
  })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  if (!PUSH_WEBHOOK_SECRET) {
    console.error('send-push: PUSH_WEBHOOK_SECRET no configurado')
    return json(500, { error: 'not_configured' })
  }
  if (!(await safeEqual(req.headers.get('x-push-secret') ?? '', PUSH_WEBHOOK_SECRET))) {
    return json(401, { error: 'unauthorized' })
  }

  const sa = loadServiceAccount()
  if (!sa) {
    console.error('send-push: FCM_SERVICE_ACCOUNT_B64 ausente o invalida')
    return json(500, { error: 'not_configured' })
  }

  let notificationId: unknown
  try {
    notificationId = (await req.json()).notification_id
  } catch {
    return json(400, { error: 'bad_json' })
  }
  if (typeof notificationId !== 'string' || !UUID_RE.test(notificationId)) {
    return json(400, { error: 'bad_notification_id' })
  }

  const nRes = await rest(
    `notifications?id=eq.${notificationId}&select=id,user_id,type,booking_id,title,body`,
  )
  if (!nRes.ok) {
    console.error('send-push: lectura de notificacion fallo', nRes.status)
    return json(502, { error: 'db_read_failed' })
  }
  const notification = (await nRes.json())[0]
  if (!notification) return json(404, { error: 'notification_not_found' })

  const tRes = await rest(`device_tokens?user_id=eq.${notification.user_id}&select=token`)
  if (!tRes.ok) {
    console.error('send-push: lectura de tokens fallo', tRes.status)
    return json(502, { error: 'db_read_failed' })
  }
  const tokens: string[] = (await tRes.json()).map((r: { token: string }) => r.token)
  if (tokens.length === 0) return json(200, { sent: 0, failed: 0, removed: 0 })

  let accessToken: string
  try {
    accessToken = await getAccessToken(sa)
  } catch (e) {
    console.error('send-push: no se obtuvo token OAuth', String(e))
    return json(502, { error: 'oauth_failed' })
  }

  // data: solo strings. La app usa type/booking_id para abrir la pantalla correcta al tocar el push.
  const data: Record<string, string> = { type: notification.type, notification_id: notification.id }
  if (notification.booking_id) data.booking_id = notification.booking_id

  let sent = 0
  let failed = 0
  let removed = 0
  for (const token of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: notification.title, body: notification.body ?? '' },
          data,
          android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL_ID } },
        },
      }),
    })
    if (res.ok) {
      sent++
      continue
    }
    failed++
    const err = await res.json().catch(() => ({}))
    const codes = JSON.stringify(err?.error?.details ?? [])
    console.error('send-push: FCM', res.status, err?.error?.status, err?.error?.message)
    // UNREGISTERED = el token ya no existe (app desinstalada / datos borrados): se descarta.
    if (res.status === 404 || codes.includes('UNREGISTERED')) {
      const del = await rest(`device_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' })
      if (del.ok) removed++
    }
  }

  return json(200, { sent, failed, removed })
})
