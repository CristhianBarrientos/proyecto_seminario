import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { IonButton, IonIcon, IonSpinner } from '@ionic/react';
import { cloudOfflineOutline } from 'ionicons/icons';

interface BoundaryState {
  failed: boolean;
}

/**
 * Atrapa el fallo de descarga de un chunk lazy (sin conexión, o un deploy nuevo que invalidó los
 * hashes de los chunks viejos). Sin esto React desmonta todo el árbol y queda pantalla en blanco.
 * React.lazy cachea la promesa rechazada, así que reintentar sin recargar no sirve: se ofrece recargar.
 */
class ChunkErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
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
      <div className="app-empty">
        <IonIcon icon={cloudOfflineOutline} />
        <h3>No se pudo cargar la pantalla</h3>
        <p>Revisá tu conexión e intentá de nuevo.</p>
        <IonButton onClick={() => window.location.reload()}>Recargar</IonButton>
      </div>
    );
  }
}

/** Envuelve una pantalla lazy: spinner mientras baja el chunk y mensaje con recarga si falla. */
const LazyRoute: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ChunkErrorBoundary>
    <Suspense
      fallback={(
        <div className="ion-text-center ion-padding">
          <IonSpinner />
        </div>
      )}
    >
      {children}
    </Suspense>
  </ChunkErrorBoundary>
);

export default LazyRoute;
