import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IonButton, IonCheckbox, IonIcon } from '@ionic/react';
import { calendarOutline, cashOutline, chatbubbleOutline, chatbubblesOutline, constructOutline } from 'ionicons/icons';
import { STATUS_META, type BookingListItem } from '../lib/useBookingsList';
import ChatModal from './ChatModal';
import './Bookings.css';

interface Props {
  booking: BookingListItem;
  partyLabel: string;
  /** Info extra junto al nombre de la contraparte (ej. su calificación promedio). */
  partyExtra?: ReactNode;
  children?: ReactNode;
  /** Modo selección (ocultar solicitudes): muestra un checkbox en la tarjeta. */
  selection?: { selected: boolean; onToggle: () => void };
  /**
   * Punto rojo en el botón de Chat. Es solo un indicador de "hay algo nuevo" - no un conteo: la
   * tabla notifications guarda una sola fila new_message sin leer por reserva (el trigger no crea
   * otra mientras esa siga sin leer), así que no hay forma de saber cuántos mensajes son.
   */
  hasUnreadChat?: boolean;
  /** Abre el chat de esta tarjeta desde afuera (p. ej. al tocar una notificación). */
  forceOpenChat?: boolean;
  onChatOpened?: () => void;
}

const BookingCard: React.FC<Props> = ({
  booking: b, partyLabel, partyExtra, children, selection, hasUnreadChat, forceOpenChat, onChatOpened,
}) => {
  const [chatOpen, setChatOpen] = useState(false);
  const canChat = b.status !== 'cancelado';

  // El callback se lee por ref: si el padre pasa una arrow nueva en cada render, el efecto de abajo
  // no se vuelve a disparar (reabriria el chat si el usuario lo cerró antes de que se limpie el pedido).
  const onChatOpenedRef = useRef(onChatOpened);
  useEffect(() => {
    onChatOpenedRef.current = onChatOpened;
  });

  useEffect(() => {
    if (!forceOpenChat) return;
    if (canChat) setChatOpen(true);
    // Se limpia el pedido aunque no se pueda abrir (reserva cancelada): si no, queda pegado.
    onChatOpenedRef.current?.();
  }, [forceOpenChat, canChat]);

  return (
  <div className="app-card booking-item">
    <div className="booking-item__header">
      <p className="booking-item__title">
        {selection && (
          <IonCheckbox
            checked={selection.selected}
            onIonChange={selection.onToggle}
            aria-label="Seleccionar solicitud"
            style={{ marginRight: 8 }}
          />
        )}
        <IonIcon icon={constructOutline} />
        {b.services?.title ?? 'Servicio'}
      </p>
      <span className={`app-chip booking-status booking-status--${b.status}`}>
        <IonIcon icon={STATUS_META[b.status].icon} />
        {STATUS_META[b.status].label}
      </span>
    </div>

    <p className="booking-item__party">
      {partyLabel} {b.otherPartyName ?? 'Usuario'}
      {partyExtra}
    </p>

    {b.scheduled_at && (
      <p className="booking-item__meta">
        <IonIcon icon={calendarOutline} color="medium" />
        {new Date(b.scheduled_at).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    )}

    {b.price_agreed !== null && (
      <p className="booking-item__meta">
        <IonIcon icon={cashOutline} color="medium" />
        Precio acordado: Q{b.price_agreed.toLocaleString('es-GT')}
      </p>
    )}

    {b.notes && (
      <p className="booking-item__meta booking-item__notes">
        <IonIcon icon={chatbubbleOutline} color="medium" />
        {b.notes}
      </p>
    )}

    {(children || canChat) && (
      <div className="booking-item__actions">
        {children}
        {canChat && (
          <IonButton fill="outline" color="tertiary" size="small" className="booking-item__chat-btn" onClick={() => setChatOpen(true)}>
            <IonIcon icon={chatbubblesOutline} slot="start" />
            Chat
            {hasUnreadChat && <span className="booking-item__chat-dot" aria-label="Mensajes nuevos" />}
          </IonButton>
        )}
      </div>
    )}

    {canChat && (
      <ChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        bookingId={b.id}
        otherName={b.otherPartyName}
      />
    )}
  </div>
  );
};

export default BookingCard;
