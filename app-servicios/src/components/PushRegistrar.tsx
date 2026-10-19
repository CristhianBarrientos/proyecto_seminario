import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { registerPush } from '../lib/pushNotifications';

/**
 * Activa el push nativo mientras haya sesión y lleva a la pantalla correcta al tocar un aviso.
 * No renderiza nada. Va dentro del Router (usa navigate). En web es un no-op.
 * El borrado del token al cerrar sesión lo hacen AuthContext.signOut e IdleSessionGuard.
 */
const PushRegistrar: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  // El listener se registra una sola vez por proceso: debe llamar siempre al navigate vigente.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!userId) return;
    void registerPush((path) => navigateRef.current(path));
  }, [userId]);

  return null;
};

export default PushRegistrar;
