import { useState, type ReactNode } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
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
}

const BookingCard: React.FC<Props> = ({ booking: b, partyLabel, partyExtra, children }) => {
  const [chatOpen, setChatOpen] = useState(false);
  const canChat = b.status !== 'cancelado';

  return (
  <div className="app-card booking-item">
    <div className="booking-item__header">
      <p className="booking-item__title">
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
          <IonButton fill="outline" color="tertiary" size="small" onClick={() => setChatOpen(true)}>
            <IonIcon icon={chatbubblesOutline} slot="start" />
            Chat
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
