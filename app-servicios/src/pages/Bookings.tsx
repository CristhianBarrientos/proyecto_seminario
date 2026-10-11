import { useState } from 'react';
import { IonContent, IonFab, IonHeader, IonPage, IonTitle, IonToolbar, IonSpinner } from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import ClientBookings from '../components/ClientBookings';
import ProfessionalBookings from '../components/ProfessionalBookings';
import NotificationsFab from '../components/NotificationsFab';

const Bookings: React.FC = () => {
  const { user, role } = useAuth();
  // Al tocar una notificación de mensaje nuevo en el FAB, la lista correspondiente (cliente o
  // profesional, la que esté montada) abre el chat de esa reserva y limpia este estado.
  const [openChatBookingId, setOpenChatBookingId] = useState<string | null>(null);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle className="app-title">Mis solicitudes</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {!user || !role ? (
          <div className="ion-text-center ion-padding">
            <IonSpinner />
          </div>
        ) : role === 'profesional' ? (
          <ProfessionalBookings userId={user.id} openChatBookingId={openChatBookingId} onChatHandled={() => setOpenChatBookingId(null)} />
        ) : (
          <ClientBookings userId={user.id} openChatBookingId={openChatBookingId} onChatHandled={() => setOpenChatBookingId(null)} />
        )}
        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <NotificationsFab onOpenChat={setOpenChatBookingId} />
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default Bookings;
