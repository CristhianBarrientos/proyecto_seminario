import { IonIcon, IonText, IonSpinner, IonButton } from '@ionic/react';
import { hourglassOutline, closeCircleOutline } from 'ionicons/icons';
import { useBookingsList } from '../lib/useBookingsList';
import { useBookingsView, isHideable } from '../lib/useBookingsView';
import BookingCard from './BookingCard';
import BookingsToolbar from './BookingsToolbar';
import ReportButton from './ReportButton';
import './Bookings.css';

interface Props {
  userId: string;
}

const ClientBookings: React.FC<Props> = ({ userId }) => {
  const { bookings, loading, error, pendingIds, updateStatus, hideBookings } = useBookingsList(userId, 'client_id');
  const view = useBookingsView(bookings, hideBookings);

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

      {bookings.length > 0 && (
        <BookingsToolbar
          filter={view.filter}
          onFilterChange={view.setFilter}
          canceledLabel="Canceladas"
          selectMode={view.selectMode}
          onToggleSelectMode={view.toggleSelectMode}
          hideableCount={view.hideableCount}
          selectedCount={view.selected.size}
          allSelected={view.allSelected}
          onToggleAll={view.toggleAll}
          onHideSelected={view.hideSelected}
          hiding={view.hiding}
        />
      )}

      {bookings.length > 0 && view.filtered.length === 0 && (
        <p className="ion-padding-horizontal">No hay solicitudes en este filtro.</p>
      )}

      {view.filtered.map((b) => (
        <BookingCard
          key={b.id}
          booking={b}
          partyLabel="Con"
          selection={view.selectMode && isHideable(b)
            ? { selected: view.selected.has(b.id), onToggle: () => view.toggle(b.id) }
            : undefined}
        >
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
          <ReportButton
            reporterId={userId}
            reportedId={b.professional_id}
            reportedName={b.otherPartyName}
            bookingId={b.id}
          />
        </BookingCard>
      ))}
    </div>
  );
};

export default ClientBookings;
