/**
 * Lógica de cierre de sesión por inactividad (issue #56). Separada del componente para poder
 * probarla sin DOM: la decisión es una función pura de (ahora, última actividad).
 */

/** Sin interacción durante este tiempo se cierra la sesión. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** Cuánto antes del cierre se muestra el aviso (a los 29 min con el límite de 30). */
export const IDLE_WARNING_MS = 60 * 1000;
/** Como mucho una escritura de "última actividad" cada tanto, aunque lleguen eventos a ráfagas. */
export const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;

export type IdleState = 'active' | 'warning' | 'expired';

export function idleState(
  now: number,
  lastActivity: number,
  limitMs = IDLE_LIMIT_MS,
  warningMs = IDLE_WARNING_MS,
): IdleState {
  const idle = now - lastActivity;
  if (idle >= limitMs) return 'expired';
  if (idle >= limitMs - warningMs) return 'warning';
  return 'active';
}

/** Segundos que faltan para el cierre (para mostrar en el aviso). Nunca negativo. */
export function secondsUntilExpiry(now: number, lastActivity: number, limitMs = IDLE_LIMIT_MS): number {
  return Math.max(0, Math.ceil((lastActivity + limitMs - now) / 1000));
}

// La última actividad vive en localStorage para compartirla entre pestañas: actividad en una
// mantiene viva la sesión en todas. Todo en try/catch: el storage puede estar bloqueado
// (modo privado, datos de sitio bloqueados) y la app tiene que seguir funcionando con memoria.
const LAST_ACTIVITY_KEY = 'session:lastActivity';
const EXPIRED_NOTICE_KEY = 'session:expiredByIdle';

export function readLastActivity(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(ts: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    /* sin storage: la guardia usa su copia en memoria */
  }
}

export function clearLastActivity(): void {
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* nada que limpiar */
  }
}

/** Marca que la próxima pantalla de Login debe explicar por qué se cerró la sesión. */
export function flagIdleLogout(): void {
  try {
    window.sessionStorage.setItem(EXPIRED_NOTICE_KEY, '1');
  } catch {
    /* sin aviso, pero el cierre igual ocurre */
  }
}

/**
 * Lee la marca SIN borrarla: se usa en un inicializador de estado, que React puede ejecutar más de
 * una vez (StrictMode) y debe ser puro. El borrado va aparte, en un efecto (clearIdleLogoutFlag).
 */
export function peekIdleLogoutFlag(): boolean {
  try {
    return window.sessionStorage.getItem(EXPIRED_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Borra la marca: tras mostrar el aviso (una sola vez) o si el cierre por inactividad falló. */
export function clearIdleLogoutFlag(): void {
  try {
    window.sessionStorage.removeItem(EXPIRED_NOTICE_KEY);
  } catch {
    /* nada que limpiar */
  }
}
