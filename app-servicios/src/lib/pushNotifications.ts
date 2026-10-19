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

// Token del dispositivo vigente; se necesita para borrarlo al cerrar sesión.
let currentToken: string | null = null;
let listenersReady = false;

async function saveToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('register_device_token', { p_token: token, p_platform: 'android' });
  if (error) {
    console.error('[Push] no se pudo registrar el token:', error);
    return;
  }
  currentToken = token;
}

/**
 * Pide permiso (Android 13+), crea el canal y registra el dispositivo. Idempotente: se puede llamar en cada login.
 * `onOpen` recibe la ruta a abrir cuando el usuario toca un push (app en segundo plano o cerrada).
 */
export async function registerPush(onOpen: (path: string) => void): Promise<void> {
  if (!isPushSupported()) return;

  try {
    if (!listenersReady) {
      listenersReady = true;
      await PushNotifications.addListener('registration', (t) => { void saveToken(t.value); });
      await PushNotifications.addListener('registrationError', (e) => {
        console.error('[Push] error de registro FCM:', e);
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) => {
        const path = pushTargetPath(a.notification.data);
        if (path) onOpen(path);
      });
    }

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
 * Es de mejor esfuerzo: nunca bloquea ni hace fallar el cierre de sesión.
 */
export async function unregisterPush(): Promise<void> {
  if (!isPushSupported()) return;
  const token = currentToken;
  currentToken = null;
  try {
    if (token) {
      const { error } = await supabase.from('device_tokens').delete().eq('token', token);
      if (error) console.error('[Push] no se pudo borrar el token:', error);
    }
    // Invalida el token en FCM: aunque el DELETE fallara (sin red), el servidor lo descarta al primer envío.
    await PushNotifications.unregister();
  } catch (err) {
    console.error('[Push] no se pudo desregistrar:', err);
  }
}
