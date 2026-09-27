import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { calendarOutline, cashOutline, chatbubbleOutline, constructOutline } from 'ionicons/icons';
import { STATUS_META, type BookingListItem } from '../lib/useBookingsList';
import './Bookings.css';

interface Props {
  booking: BookingListItem;
  partyLabel: string;
  children?: ReactNode;
}

const BookingCard: React.FC<Props> = ({ booking: b, partyLabel, children }) => (
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

    <p className="booking-item__party">{partyLabel} {b.otherPartyName ?? 'Usuario'}</p>

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

    {children && <div className="booking-item__actions">{children}</div>}
  </div>
);

export default BookingCard;
