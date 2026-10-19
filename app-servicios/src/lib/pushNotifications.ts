import { Capacitor } from '@capacitor/core';
import { PushNotifications, type ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from './supabaseClient';

/**
 * Push nativo (FCM) en el APK. Flujo completo en sql_docker/feature-push.sql y edge_functions/send-push:
 * INSERT en notifications -> trigger -> Edge Function -> FCM -> este dispositivo.
 *
 * - Solo existe en nativo: en web todo esto es un no-op (las notificaciones in-app por realtime siguen igual).
 * - Con la app en primer plano no se muestra nada del sistema: ya hay un toast por realtime.
 * - El token se guarda en public.device_tokens por RPC (reasigna el token si cambia la cuenta del teléfono).
 */

/** Debe coincidir con ANDROID_CHANNEL_ID de la Edge Function send-push. */
export const PUSH_CHANNEL_ID = 'yaquedo_default';

const TOKEN_STORAGE_KEY = 'yaquedo.pushToken';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTIFICATION_TYPES = ['booking_requested', 'booking_status', 'new_message'] as const;

export const isPushSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');

/**
 * A qué pantalla lleva un push al tocarlo. `data` viene del servidor pero se trata como entrada no
 * confiable: solo se aceptan tipos conocidos y un booking_id con formato UUID (nada llega a la URL sin validar).
 */
export function pushTargetPath(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const type = data.type;
  if (typeof type !== 'string' || !(NOTIFICATION_TYPES as readonly string[]).includes(type)) return null;
  const bookingId = typeof data.booking_id === 'string' && UUID_RE.test(data.booking_id) ? data.booking_id : null;
  if (type === 'new_message' && bookingId) return `/tabs/bookings?chat=${bookingId}`;
  return '/tabs/bookings';
}

// El token vigente se guarda también en localStorage: si la app se reinicia antes de que llegue el evento
// 'registration' (o el RPC falla), unregisterPush todavía puede borrar la fila correcta al cerrar sesión.
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* sin almacenamiento: queda solo el de memoria */
  }
}

let currentToken: string | null = readStoredToken();
// Promesa (no booleano): dos llamadas simultáneas esperan la misma instalación y, si falla, se reintenta.
let listenersReady: Promise<void> | null = null;

async function saveToken(token: string): Promise<void> {
  // Se recuerda ANTES del RPC: aunque falle, el token es de este dispositivo y hay que poder desasociarlo.
  currentToken = token;
  writeStoredToken(token);
  const { error } = await supabase.rpc('register_device_token', { p_token: token, p_platform: 'android' });
  if (error) console.error('[Push] no se pudo registrar el token:', error);
}

function installListeners(onOpen: (path: string) => void): Promise<void> {
  if (!listenersReady) {
    listenersReady = (async () => {
      await PushNotifications.addListener('registration', (t) => { void saveToken(t.value); });
      await PushNotifications.addListener('registrationError', (e) => {
        console.error('[Push] error de registro FCM:', e);
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) => {
        const path = pushTargetPath(a.notification.data);
        if (path) onOpen(path);
      });
    })().catch((err) => {
      listenersReady = null;
      throw err;
    });
  }
  return listenersReady;
}

/**
 * Pide permiso (Android 13+), crea el canal y registra el dispositivo. Idempotente: se puede llamar en cada login.
 * `onOpen` recibe la ruta a abrir cuando el usuario toca un push (app en segundo plano o cerrada).
 */
export async function registerPush(onOpen: (path: string) => void): Promise<void> {
  if (!isPushSupported()) return;

  try {
    await installListeners(onOpen);

    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_ID,
      name: 'Notificaciones',
      description: 'Solicitudes, cambios de estado y mensajes',
      importance: 4,
      visibility: 0, // privada: en pantalla bloqueada no se muestra el texto del mensaje
      vibration: true,
    });

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();
  } catch (err) {
    console.error('[Push] no se pudo activar:', err);
  }
}

/**
 * Quita este dispositivo de la cuenta actual. Debe llamarse ANTES de cerrar la sesión (el DELETE necesita
 * auth.uid()): si no, el teléfono seguiría recibiendo los avisos (con texto de chats) de una cuenta ya cerrada.
 * Es de mejor esfuerzo: nunca lanza ni bloquea el cierre de sesión. Si el cierre de sesión después falla y el
 * usuario sigue logueado, el llamador debe invocar resumePush().
 */
export async function unregisterPush(): Promise<void> {
  if (!isPushSupported()) return;
  const token = currentToken ?? readStoredToken();
  try {
    if (token) {
      const { error } = await supabase.from('device_tokens').delete().eq('token', token);
      if (error) console.error('[Push] no se pudo borrar el token:', error);
      else {
        currentToken = null;
        writeStoredToken(null);
      }
    }
    // Invalida el token en FCM: aunque el DELETE fallara (sin red), el servidor lo descarta al primer envío.
    await PushNotifications.unregister();
  } catch (err) {
    console.error('[Push] no se pudo desregistrar:', err);
  }
}

/**
 * Reactiva el push tras un unregisterPush cuyo cierre de sesión NO ocurrió (p. ej. sin red): obtiene un token
 * nuevo (el anterior se invalidó) y lo registra con la sesión que sigue vigente. No-op si no hay permiso.
 */
export async function resumePush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') await PushNotifications.register();
  } catch (err) {
    console.error('[Push] no se pudo reactivar:', err);
  }
}
