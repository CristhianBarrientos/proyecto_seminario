import { IonIcon, IonText, IonSpinner, IonButton } from '@ionic/react';
import { hourglassOutline, closeCircleOutline } from 'ionicons/icons';
import { useBookingsList } from '../lib/useBookingsList';
import BookingCard from './BookingCard';
import './Bookings.css';

interface Props {
  userId: string;
}

const ClientBookings: React.FC<Props> = ({ userId }) => {
  const { bookings, loading, error, pendingIds, updateStatus } = useBookingsList(userId, 'client_id');

  if (loading) {
    return (
      <div className="ion-text-center ion-padding">
        <IonSpinner />
      </div>
    );
  }

  return (
    <div className="bookings-list">
      {error && <IonText color="danger"><p className="ion-padding-horizontal">{error}</p></IonText>}

      {bookings.length === 0 && (
        <div className="app-empty">
          <IonIcon icon={hourglassOutline} />
          <h3>Todavía no pediste ningún servicio</h3>
          <p>Cuando solicités un servicio a un profesional, el estado va a aparecer acá.</p>
        </div>
      )}

      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} partyLabel="Con">
          {(b.status === 'solicitado' || b.status === 'aceptado') && (
            <IonButton
              fill="clear"
              color="danger"
              disabled={pendingIds.has(b.id)}
              onClick={() => updateStatus(b.id, 'cancelado')}
            >
              <IonIcon icon={closeCircleOutline} slot="start" />
              Cancelar solicitud
            </IonButton>
          )}
        </BookingCard>
      ))}
    </div>
  );
};

export default ClientBookings;
