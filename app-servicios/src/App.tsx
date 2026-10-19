import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Capacitor } from '@capacitor/core';
import Login from './pages/Login';
import LazyRoute from './components/LazyRoute';
import Tabs from './Tabs';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import IdleSessionGuard from './components/IdleSessionGuard';
import PushRegistrar from './components/PushRegistrar';

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

// La landing es solo web: lazy para que su codigo y su CSS no entren al bundle inicial del APK nativo.
const Landing = lazy(() => import('./pages/Landing'));

setupIonicReact();

const AppRoutes: React.FC = () => {
  const { session, loading } = useAuth();

  if (loading) return null;

  return (
    <IonReactRouter>
      <PushRegistrar />
      <IonRouterOutlet>
        <Route
          path="/login"
          element={session ? <Navigate to="/tabs/home" replace /> : <Login />}
        />
        <Route
          path="/tabs/*"
          element={session ? <Tabs /> : <Navigate to="/login" replace />}
        />
        {/* La landing es solo web: la app nativa (APK) entra directo a login / home. */}
        <Route
          path="/"
          element={
            Capacitor.isNativePlatform()
              ? <Navigate to={session ? '/tabs/home' : '/login'} replace />
              : <LazyRoute asPage><Landing /></LazyRoute>
          }
        />
      </IonRouterOutlet>
    </IonReactRouter>
  );
};

const App: React.FC = () => (
  <IonApp>
    <ThemeProvider>
      <AuthProvider>
        <IdleSessionGuard />
        <NotificationsProvider>
          <AppRoutes />
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  </IonApp>
);

export default App;