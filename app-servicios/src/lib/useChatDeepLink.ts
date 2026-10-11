import { useEffect, useMemo, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationsContext';
import type { BookingListItem } from './useBookingsList';

/** Ids de reservas con una notificación new_message sin leer (punto rojo del botón Chat). */
export function useUnreadChatIds(): Set<string> {
  const { notifications } = useNotifications();
  return useMemo(
    () => new Set(
      notifications.filter((n) => n.type === 'new_message' && !n.read_at && n.booking_id).map((n) => n.booking_id as string),
    ),
    [notifications],
  );
}

/**
 * Atiende el pedido de abrir el chat de una reserva (viene del FAB de notificaciones):
 * - Espera a que la lista termine de cargar; antes no hay forma de saber si la reserva existe.
 * - Si está en la lista, `revealBooking` cambia el filtro si lo estaba escondiendo, y la tarjeta
 *   (que recibe forceOpenChat) abre el chat.
 * - Si NO está (oculta por el usuario o ya no existe), limpia el pedido con `onHandled`: si no,
 *   el id quedaría pegado y tocar la misma notificación otra vez no haría nada.
 * Los callbacks se leen por ref: no hace falta que el padre los memorice y un re-render no
 * vuelve a disparar el efecto.
 */
export function useRequestedChat(
  requestedId: string | null | undefined,
  bookings: BookingListItem[],
  loading: boolean,
  revealBooking: (id: string) => void,
  onHandled?: () => void,
) {
  const revealRef = useRef(revealBooking);
  const handledRef = useRef(onHandled);
  useEffect(() => {
    revealRef.current = revealBooking;
    handledRef.current = onHandled;
  });

  useEffect(() => {
    if (!requestedId || loading) return;
    if (bookings.some((b) => b.id === requestedId)) revealRef.current(requestedId);
    else handledRef.current?.();
  }, [requestedId, loading, bookings]);
}
