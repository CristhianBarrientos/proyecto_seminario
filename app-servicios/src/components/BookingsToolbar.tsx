import { useState } from 'react';
import { IonAlert, IonButton, IonIcon, IonLabel, IonSegment, IonSegmentButton } from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import type { BookingFilter } from '../lib/useBookingsView';
import './Bookings.css';

interface Props {
  filter: BookingFilter;
  onFilterChange: (f: BookingFilter) => void;
  /** "Rechazadas" para el profesional, "Canceladas" para el cliente. */
  canceledLabel: string;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  hideableCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onHideSelected: () => void;
  hiding: boolean;
}

const BookingsToolbar: React.FC<Props> = ({
  filter, onFilterChange, canceledLabel, selectMode, onToggleSelectMode, hideableCount,
  selectedCount, allSelected, onToggleAll, onHideSelected, hiding,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="bookings-toolbar">
      <IonSegment
        scrollable
        value={filter}
        onIonChange={(e) => e.detail.value && onFilterChange(e.detail.value as BookingFilter)}
      >
        <IonSegmentButton value="todas"><IonLabel>Todas</IonLabel></IonSegmentButton>
        <IonSegmentButton value="pendientes"><IonLabel>Pendientes</IonLabel></IonSegmentButton>
        <IonSegmentButton value="aceptadas"><IonLabel>Aceptadas</IonLabel></IonSegmentButton>
        <IonSegmentButton value="canceladas"><IonLabel>{canceledLabel}</IonLabel></IonSegmentButton>
        <IonSegmentButton value="completadas"><IonLabel>Completadas</IonLabel></IonSegmentButton>
      </IonSegment>

      <div className="bookings-toolbar__actions">
        <IonButton fill="clear" size="small" disabled={hideableCount === 0 && !selectMode} onClick={onToggleSelectMode}>
          {selectMode ? 'Cancelar selección' : 'Seleccionar para eliminar'}
        </IonButton>
        {selectMode && (
          <>
            <IonButton fill="clear" size="small" disabled={hideableCount === 0} onClick={onToggleAll}>
              {allSelected ? 'Quitar todas' : 'Seleccionar todas'}
            </IonButton>
            <IonButton
              fill="solid"
              color="danger"
              size="small"
              disabled={selectedCount === 0 || hiding}
              onClick={() => setConfirmOpen(true)}
            >
              <IonIcon icon={trashOutline} slot="start" />
              Eliminar ({selectedCount})
            </IonButton>
          </>
        )}
      </div>
      {selectMode && (
        <p className="bookings-toolbar__hint">
          Solo se pueden eliminar solicitudes canceladas o completadas. Se quitan de tu lista; la otra persona las sigue viendo.
        </p>
      )}

      <IonAlert
        isOpen={confirmOpen}
        header="Eliminar de tu lista"
        message={`Se van a quitar ${selectedCount} solicitud(es) y su chat de tu lista. La otra persona las sigue viendo.`}
        onDidDismiss={() => setConfirmOpen(false)}
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Eliminar', role: 'destructive', handler: () => { onHideSelected(); } },
        ]}
      />
    </div>
  );
};

export default BookingsToolbar;
