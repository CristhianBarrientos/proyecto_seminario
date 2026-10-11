import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonSpinner, IonButton, IonText } from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import ClientBookings from '../components/ClientBookings';
import ProfessionalBookings from '../components/ProfessionalBookings';
import NotificationsList from '../components/NotificationsList';

const Bookings: React.FC = () => {
  const { user, role, roleError, retryRole } = useAuth();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle className="app-title">Mis solicitudes</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <NotificationsList />
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
          <ProfessionalBookings userId={user.id} />
        ) : (
          <ClientBookings userId={user.id} />
        )}
      </IonContent>
    </IonPage>
  );
};

export default Bookings;
