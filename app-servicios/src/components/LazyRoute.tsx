import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { IonButton, IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/react';
import { cloudOfflineOutline } from 'ionicons/icons';

interface BoundaryState {
  failed: boolean;
}

/**
 * Una ruta de primer nivel de IonRouterOutlet debe renderizar un IonPage: sin el, Ionic anima la
 * transicion sobre un contenedor que no es pagina. Con `asPage` el spinner y el error van dentro de uno.
 */
const Shell: React.FC<{ asPage?: boolean; children: ReactNode }> = ({ asPage, children }) => (
  asPage ? <IonPage><IonContent>{children}</IonContent></IonPage> : <>{children}</>
);

/**
 * Atrapa el fallo de descarga de un chunk lazy (sin conexión, o un deploy nuevo que invalidó los
 * hashes de los chunks viejos). Sin esto React desmonta todo el árbol y queda pantalla en blanco.
 * React.lazy cachea la promesa rechazada, así que reintentar sin recargar no sirve: se ofrece recargar.
 */
class ChunkErrorBoundary extends Component<{ children: ReactNode; asPage?: boolean }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LazyRoute] no se pudo cargar la pantalla:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Shell asPage={this.props.asPage}>
        <div className="app-empty">
          <IonIcon icon={cloudOfflineOutline} />
          <h3>No se pudo cargar la pantalla</h3>
          <p>Revisá tu conexión e intentá de nuevo.</p>
          <IonButton onClick={() => window.location.reload()}>Recargar</IonButton>
        </div>
      </Shell>
    );
  }
}

/** Envuelve una pantalla lazy: spinner mientras baja el chunk y mensaje con recarga si falla. */
const LazyRoute: React.FC<{ children: ReactNode; asPage?: boolean }> = ({ children, asPage }) => (
  <ChunkErrorBoundary asPage={asPage}>
    <Suspense
      fallback={(
        <Shell asPage={asPage}>
          <div className="ion-text-center ion-padding">
            <IonSpinner />
          </div>
        </Shell>
      )}
    >
      {children}
    </Suspense>
  </ChunkErrorBoundary>
);

export default LazyRoute;
