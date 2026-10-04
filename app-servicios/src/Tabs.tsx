import { lazy, Suspense } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/react';
import { compassOutline, clipboardOutline, personCircleOutline } from 'ionicons/icons';
import Home from './pages/Home';
import { useAuth } from './contexts/AuthContext';

// Home queda eager (es la pantalla de aterrizaje); el resto se descarga bajo demanda
// para no meter todas las pantallas en el bundle inicial.
const Bookings = lazy(() => import('./pages/Bookings'));
const Profile = lazy(() => import('./pages/Profile'));
const EditProfessionalProfile = lazy(() => import('./pages/EditProfessionalProfile'));
const MyServices = lazy(() => import('./pages/MyServices'));
const ProfessionalDetail = lazy(() => import('./pages/ProfessionalDetail'));

const Lazy: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

// Rutas que solo tienen sentido para el rol "profesional" (formularios de
// perfil/servicios profesionales). Un cliente que navega ahí por URL directa
// termina con errores confusos de RLS/FK en vez de un simple redirect.
const ProfessionalOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role } = useAuth();
  if (role !== null && role !== 'profesional') {
    return <Navigate to="/tabs/profile" replace />;
  }
  return <>{children}</>;
};

// "Mis servicios" depende de una fila en professional_profiles (services.professional_id
// la referencia por FK, no a profiles.id) - un profesional que nunca completó "Editar
// perfil profesional" chocaba acá con un 23503 genérico ("Falta información relacionada
// necesaria...") en vez de un mensaje que le diga qué le falta.
const RequiresProfessionalProfile: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasProfessionalProfile } = useAuth();
  if (hasProfessionalProfile === false) {
    return <Navigate to="/tabs/profile/edit" replace state={{ reason: 'complete-profile-first' }} />;
  }
  return <>{children}</>;
};

const Tabs: React.FC = () => {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/tabs/home" element={<Home />} />
        <Route path="/tabs/home/:id" element={<Lazy><ProfessionalDetail /></Lazy>} />
        <Route path="/tabs/bookings" element={<Lazy><Bookings /></Lazy>} />
        <Route path="/tabs/profile" element={<Lazy><Profile /></Lazy>} />
        <Route
          path="/tabs/profile/edit"
          element={
            <ProfessionalOnly>
              <Lazy><EditProfessionalProfile /></Lazy>
            </ProfessionalOnly>
          }
        />
        <Route
          path="/tabs/profile/services"
          element={
            <ProfessionalOnly>
              <RequiresProfessionalProfile>
                <Lazy><MyServices /></Lazy>
              </RequiresProfessionalProfile>
            </ProfessionalOnly>
          }
        />
        <Route path="/tabs" element={<Navigate to="/tabs/home" replace />} />
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="home" href="/tabs/home">
          <IonIcon icon={compassOutline} />
          <IonLabel>Explorar</IonLabel>
        </IonTabButton>
        <IonTabButton tab="bookings" href="/tabs/bookings">
          <IonIcon icon={clipboardOutline} />
          <IonLabel>Solicitudes</IonLabel>
        </IonTabButton>
        <IonTabButton tab="profile" href="/tabs/profile">
          <IonIcon icon={personCircleOutline} />
          <IonLabel>Perfil</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
};

export default Tabs;