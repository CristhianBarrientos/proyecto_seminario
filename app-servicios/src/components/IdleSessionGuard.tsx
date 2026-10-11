import { useEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { timeOutline } from 'ionicons/icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  ACTIVITY_WRITE_THROTTLE_MS, clearIdleLogoutFlag, clearLastActivity, flagIdleLogout, idleState,
  readLastActivity, secondsUntilExpiry, writeLastActivity,
} from '../lib/idleSession';
import './IdleSessionGuard.css';

// Interacción real del usuario. Se excluye 'scroll' a propósito: también salta por scrolls
// programáticos (relayout, animaciones, carga de contenido) y mantendría viva una sesión
// abandonada. El desplazamiento del usuario ya lo cubren wheel, touchmove, keydown y pointerdown
// (arrastrar la barra), y esos eventos sí cruzan el shadow DOM de ion-content.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'touchmove', 'mousemove'] as const;
const TICK_MS = 1000;
/** Si el cierre falla (sin red), no insistir en cada tick. */
const SIGN_OUT_RETRY_MS = 5000;

/**
 * Cierra la sesión tras 30 min sin interacción (issue #56) y avisa 1 min antes con un mensaje
 * pequeño y no bloqueante. Se monta una vez dentro de AuthProvider; solo actúa con sesión.
 *
 * - La inactividad se mide con timestamps (Date.now), no con un setTimeout largo: las pestañas en
 *   segundo plano estrangulan los timers, y así también se detecta el caso de abrir el navegador
 *   con una sesión persistida de hace horas (se cierra de inmediato).
 * - La última actividad se comparte entre pestañas por localStorage.
 * - El cierre es `scope: 'local'`: invalida ESTA sesión en el servidor sin sacar al usuario de
 *   sus otros dispositivos. No se llama a stopAutoRefresh(): en supabase-js no se reanuda solo al
 *   volver a loguear y dejaría la sesión nueva sin renovación de token.
 */
const IdleSessionGuard: React.FC = () => {
  const { session, loading } = useAuth();
  const userId = session?.user?.id;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const lastRef = useRef(Date.now());
  const lastWriteRef = useRef(0);
  const warningRef = useRef(false);
  const signingOutRef = useRef(false);
  const lastSignOutAttemptRef = useRef(0);

  // Sin sesión se descarta la marca para que el próximo login arranque de cero. Solo cuando la
  // carga inicial terminó: mientras `loading` es true la sesión todavía es null aunque haya una
  // persistida, y borrar la marca ahí le regalaría 30 min más a una sesión abandonada hace horas
  // (y borraría la marca que mantiene viva a otra pestaña).
  useEffect(() => {
    if (!loading && !userId) clearLastActivity();
  }, [loading, userId]);

  useEffect(() => {
    if (!userId) {
      setSecondsLeft(null);
      warningRef.current = false;
      signingOutRef.current = false;
      return;
    }

    // Al montar con sesión: si ya había una marca (otra pestaña, o sesión persistida), se respeta;
    // si no, se parte de ahora.
    const stored = readLastActivity();
    const startedAt = Date.now();
    lastRef.current = stored ?? startedAt;
    if (stored === null) {
      writeLastActivity(startedAt);
      lastWriteRef.current = startedAt;
    }

    // La marca compartida puede ir atrasada respecto de la de esta pestaña (throttle de escritura)
    // o respecto de otra pestaña: vale la más reciente de las dos.
    const currentLast = () => Math.max(readLastActivity() ?? 0, lastRef.current);

    const expire = async () => {
      const now = Date.now();
      if (signingOutRef.current || now - lastSignOutAttemptRef.current < SIGN_OUT_RETRY_MS) return;
      signingOutRef.current = true;
      lastSignOutAttemptRef.current = now;
      // La marca se escribe ANTES: signOut emite SIGNED_OUT y Login puede montarse antes de que
      // vuelva la promesa. Si el cierre falla se retira, para no avisar de algo que no pasó.
      flagIdleLogout();
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch (err) {
        // Sin red supabase-js no limpia la sesión local: se reintenta en un rato (el estado sigue
        // "expired") en vez de dejar al usuario logueado.
        console.error('[IdleSession] no se pudo cerrar la sesión, se reintenta:', err);
        clearIdleLogoutFlag();
        signingOutRef.current = false;
      }
    };

    const evaluate = () => {
      const now = Date.now();
      const last = currentLast();
      const state = idleState(now, last);
      if (state === 'expired') {
        void expire();
        return;
      }
      if (state === 'warning') {
        warningRef.current = true;
        setSecondsLeft(secondsUntilExpiry(now, last));
      } else if (warningRef.current) {
        warningRef.current = false;
        setSecondsLeft(null);
      }
    };

    const onActivity = (event: Event) => {
      if (signingOutRef.current) return;
      // mousemove sin desplazamiento real (eventos sintéticos del navegador tras un relayout, o un
      // cursor quieto) no es presencia del usuario.
      if (event.type === 'mousemove') {
        const move = event as MouseEvent;
        if (!move.movementX && !move.movementY) return;
      }
      const now = Date.now();
      // Una vez pasado el límite la actividad ya no puede revivir la sesión (p. ej. durante el
      // reintento de un cierre fallido): lo único que sigue es cerrarla.
      if (idleState(now, currentLast()) === 'expired') return;

      lastRef.current = now;
      // Durante el aviso se escribe siempre: con el throttle la marca compartida podría seguir
      // vieja y el aviso no se descartaría hasta el próximo tick.
      if (warningRef.current || now - lastWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastWriteRef.current = now;
        writeLastActivity(now);
        if (warningRef.current) evaluate();
      }
    };

    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, onActivity, { capture: true, passive: true }));
    // Al volver a la pestaña o recibir la marca de otra pestaña, se reevalúa de inmediato.
    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('focus', evaluate);
    window.addEventListener('storage', evaluate);
    const timer = window.setInterval(evaluate, TICK_MS);
    evaluate();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener('visibilitychange', evaluate);
      window.removeEventListener('focus', evaluate);
      window.removeEventListener('storage', evaluate);
      window.clearInterval(timer);
    };
  }, [userId]);

  if (!userId || secondsLeft === null) return null;

  return (
    <div className="idle-warning" role="status" aria-live="polite">
      <IonIcon icon={timeOutline} aria-hidden="true" />
      <span>
        Tu sesión se cerrará por inactividad en {secondsLeft} s. Tocá cualquier parte para seguir conectado.
      </span>
    </div>
  );
};

export default IdleSessionGuard;
