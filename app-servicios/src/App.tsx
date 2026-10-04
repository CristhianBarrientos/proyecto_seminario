import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Login from './pages/Login';
import Tabs from './Tabs';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationsProvider } from './contexts/NotificationsContext';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* Habilita el modo noche activable por clase (.ion-palette-dark) */
import '@ionic/react/css/palettes/dark.class.css';

import './theme/variables.css';
import './theme/global.css';

setupIonicReact();

const AppRoutes: React.FC = () => {
  const { session, loading } = useAuth();

  if (loading) return null;

  return (
    <IonReactRouter>
      <IonRouterOutlet>
        <Route
          path="/login"
          element={session ? <Navigate to="/tabs/home" replace /> : <Login />}
        />
        <Route
          path="/tabs/*"
          element={session ? <Tabs /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/"
          element={<Navigate to={session ? '/tabs/home' : '/login'} replace />}
        />
      </IonRouterOutlet>
    </IonReactRouter>
  );
};

const App: React.FC = () => (
  <IonApp>
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <AppRoutes />
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  </IonApp>
);

export default App;