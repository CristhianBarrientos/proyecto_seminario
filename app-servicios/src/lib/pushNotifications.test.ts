import { describe, expect, it, vi } from 'vitest';

// El módulo importa el cliente de Supabase (necesita variables de entorno) y el plugin nativo: ninguno hace falta aquí.
vi.mock('./supabaseClient', () => ({ supabase: {} }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {} }));

import { isPushSupported, pushTargetPath, registerPush, resumePush, unregisterPush } from './pushNotifications';

const BOOKING = '8f0c1a52-6b7e-4d0a-9c1e-2f3a4b5c6d7e';

describe('pushTargetPath', () => {
  it('un mensaje nuevo abre el chat de esa reserva', () => {
    expect(pushTargetPath({ type: 'new_message', booking_id: BOOKING })).toBe(`/tabs/bookings?chat=${BOOKING}`);
  });

  it('solicitud nueva y cambios de estado llevan a Solicitudes', () => {
    expect(pushTargetPath({ type: 'booking_requested', booking_id: BOOKING })).toBe('/tabs/bookings');
    expect(pushTargetPath({ type: 'booking_status', booking_id: BOOKING })).toBe('/tabs/bookings');
  });

  it('un mensaje sin booking_id válido no intenta abrir un chat', () => {
    expect(pushTargetPath({ type: 'new_message' })).toBe('/tabs/bookings');
    expect(pushTargetPath({ type: 'new_message', booking_id: 'no-es-uuid' })).toBe('/tabs/bookings');
  });

  it('un booking_id con intento de inyección en la URL no se propaga', () => {
    const path = pushTargetPath({ type: 'new_message', booking_id: `${BOOKING}&admin=1` });
    expect(path).toBe('/tabs/bookings');
    expect(pushTargetPath({ type: 'new_message', booking_id: '../../login' })).toBe('/tabs/bookings');
  });

  it('ignora datos ausentes, tipos desconocidos o de tipo incorrecto', () => {
    expect(pushTargetPath(undefined)).toBeNull();
    expect(pushTargetPath({})).toBeNull();
    expect(pushTargetPath({ type: 'otro', booking_id: BOOKING })).toBeNull();
    expect(pushTargetPath({ type: 42 })).toBeNull();
  });
});

describe('en web (no nativo)', () => {
  it('el push no está soportado y registrar/desregistrar son no-op', async () => {
    expect(isPushSupported()).toBe(false);
    const onOpen = vi.fn();
    await expect(registerPush(onOpen)).resolves.toBeUndefined();
    await expect(unregisterPush()).resolves.toBeUndefined();
    await expect(resumePush()).resolves.toBeUndefined();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
