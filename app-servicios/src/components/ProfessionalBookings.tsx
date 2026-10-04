import { IonIcon, IonText, IonSpinner, IonButton } from '@ionic/react';
import {
  hourglassOutline, closeCircleOutline, thumbsUpOutline, playOutline, checkmarkDoneOutline,
} from 'ionicons/icons';
import { useBookingsList } from '../lib/useBookingsList';
import { useClientReviews } from '../lib/useClientReviews';
import BookingCard from './BookingCard';
import RateClientForm from './RateClientForm';
import ReportButton from './ReportButton';
import './Bookings.css';

interface Props {
  userId: string;
}

const ProfessionalBookings: React.FC<Props> = ({ userId }) => {
  const { bookings, loading, error, pendingIds, updateStatus } = useBookingsList(userId, 'professional_id');
  const { reviewedByBooking, ratingByClient, loaded: reviewsLoaded, error: reviewError, submitReview } = useClientReviews(userId, bookings);

  if (loading) {
    return (
      <div className="ion-text-center ion-padding">
        <IonSpinner />
      </div>
    );
  }

  return (
    <div className="bookings-list">
      {(error || reviewError) && (
        <IonText color="danger"><p className="ion-padding-horizontal">{error || reviewError}</p></IonText>
      )}

      {bookings.length === 0 && (
        <div className="app-empty">
          <IonIcon icon={hourglassOutline} />
          <h3>Todavía no tenés solicitudes</h3>
          <p>Cuando un cliente te pida un servicio, va a aparecer acá.</p>
        </div>
      )}

      {bookings.map((b) => {
        const clientRating = ratingByClient.get(b.client_id);
        return (
        <BookingCard
          key={b.id}
          booking={b}
          partyLabel="De"
          partyExtra={clientRating && (
            <span className="booking-item__rating" title={`${clientRating.count} calificaciones`}>
              {' '}★ {clientRating.avg.toFixed(1)} ({clientRating.count})
            </span>
          )}
        >
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
          {b.status === 'completado' && reviewsLoaded && (
            <RateClientForm
              existingRating={reviewedByBooking.get(b.id)}
              onSubmit={(rating, comment) => submitReview(b, rating, comment)}
            />
          )}
          <ReportButton
            reporterId={userId}
            reportedId={b.client_id}
            reportedName={b.otherPartyName}
            bookingId={b.id}
          />
        </BookingCard>
        );
      })}
    </div>
  );
};

export default ProfessionalBookings;
