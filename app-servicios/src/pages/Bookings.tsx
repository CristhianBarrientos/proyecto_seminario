import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IonContent, IonFab, IonHeader, IonPage, IonTitle, IonToolbar, IonSpinner, IonButton, IonText } from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import ClientBookings from '../components/ClientBookings';
import ProfessionalBookings from '../components/ProfessionalBookings';
import NotificationsFab from '../components/NotificationsFab';

const Bookings: React.FC = () => {
  const { user, role, roleError, retryRole } = useAuth();
  // Al tocar una notificación de mensaje nuevo en el FAB, la lista correspondiente (cliente o
  // profesional, la que esté montada) abre el chat de esa reserva y limpia este estado.
  const [openChatBookingId, setOpenChatBookingId] = useState<string | null>(null);

  // Un push de mensaje nuevo llega como /tabs/bookings?chat=<id> (ver lib/pushNotifications.ts): se abre el chat
  // y se limpia el parámetro, para que tocar el mismo aviso otra vez vuelva a funcionar.
  const [searchParams, setSearchParams] = useSearchParams();
  const chatFromLink = searchParams.get('chat');
  useEffect(() => {
    if (!chatFromLink) return;
    setOpenChatBookingId(chatFromLink);
    setSearchParams({}, { replace: true });
  }, [chatFromLink, setSearchParams]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle className="app-title">Mis solicitudes</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {user && !role && roleError ? (
          <div className="ion-text-center ion-padding">
            <IonText color="danger"><p>No pudimos cargar tu perfil. Intentá de nuevo; si sigue fallando, cerrá sesión y volvé a ingresar.</p></IonText>
            <IonButton onClick={retryRole}>Reintentar</IonButton>
          </div>
        ) : !user || !role ? (
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
