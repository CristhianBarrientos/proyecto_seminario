import { IonIcon, IonText, IonSpinner, IonButton } from '@ionic/react';
import {
  hourglassOutline, closeCircleOutline, thumbsUpOutline, playOutline, checkmarkDoneOutline,
} from 'ionicons/icons';
import { useBookingsList } from '../lib/useBookingsList';
import BookingCard from './BookingCard';
import './Bookings.css';

interface Props {
  userId: string;
}

const ProfessionalBookings: React.FC<Props> = ({ userId }) => {
  const { bookings, loading, error, pendingIds, updateStatus } = useBookingsList(userId, 'professional_id');

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
          <h3>Todavía no tenés solicitudes</h3>
          <p>Cuando un cliente te pida un servicio, va a aparecer acá.</p>
        </div>
      )}

      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} partyLabel="De">
          {b.status === 'solicitado' && (
            <>
              <IonButton fill="solid" color="tertiary" disabled={pendingIds.has(b.id)} onClick={() => updateStatus(b.id, 'aceptado')}>
                <IonIcon icon={thumbsUpOutline} slot="start" />
                Aceptar
              </IonButton>
              <IonButton fill="clear" color="danger" disabled={pendingIds.has(b.id)} onClick={() => updateStatus(b.id, 'cancelado')}>
                <IonIcon icon={closeCircleOutline} slot="start" />
                Rechazar
              </IonButton>
            </>
          )}

          {b.status === 'aceptado' && (
            <>
              <IonButton fill="solid" color="tertiary" disabled={pendingIds.has(b.id)} onClick={() => updateStatus(b.id, 'en_curso')}>
                <IonIcon icon={playOutline} slot="start" />
                Iniciar trabajo
              </IonButton>
              <IonButton fill="clear" color="danger" disabled={pendingIds.has(b.id)} onClick={() => updateStatus(b.id, 'cancelado')}>
                <IonIcon icon={closeCircleOutline} slot="start" />
                Cancelar
              </IonButton>
            </>
          )}

          {b.status === 'en_curso' && (
            <>
              <IonButton fill="solid" color="tertiary" disabled={pendingIds.has(b.id)} onClick={() => updateStatus(b.id, 'completado')}>
                <IonIcon icon={checkmarkDoneOutline} slot="start" />
                Marcar completado
              </IonButton>
              <IonButton fill="clear" color="danger" disabled={pendingIds.has(b.id)} onClick={() => updateStatus(b.id, 'cancelado')}>
                <IonIcon icon={closeCircleOutline} slot="start" />
                Cancelar
              </IonButton>
            </>
          )}
        </BookingCard>
      ))}
    </div>
  );
};

export default ProfessionalBookings;
