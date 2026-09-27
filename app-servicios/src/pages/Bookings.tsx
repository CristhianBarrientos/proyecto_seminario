import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonSpinner } from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import ClientBookings from '../components/ClientBookings';
import ProfessionalBookings from '../components/ProfessionalBookings';

const Bookings: React.FC = () => {
  const { user, role } = useAuth();

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
          <ProfessionalBookings userId={user.id} />
        ) : (
          <ClientBookings userId={user.id} />
        )}
      </IonContent>
    </IonPage>
  );
};

export default Bookings;
