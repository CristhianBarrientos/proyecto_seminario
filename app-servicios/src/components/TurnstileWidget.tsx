import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { loadTurnstile, TURNSTILE_SITE_KEY, type TurnstileApi } from '../lib/captcha';

export interface TurnstileHandle {
  /**
   * Pide un token nuevo (los tokens de Turnstile son de un solo uso). Si el widget nunca llego a crearse
   * (script bloqueado, sin red) reintenta cargarlo: es la via de recuperacion sin recargar la pagina.
   */
  reset: () => void;
}

interface Props {
  /** Token valido, o `null` cuando expira, falla o el widget se desmonta. */
  onToken: (token: string | null) => void;
  /** Avisa si el script o el reto no se pudieron cargar (sin red, bloqueador de contenido). */
  onUnavailable?: (unavailable: boolean) => void;
}

/**
 * Widget de Cloudflare Turnstile en modo `interaction-only`: es invisible y solo aparece si Cloudflare
 * necesita que la persona haga algo. Renderiza solo si hay site key (ver lib/captcha.ts). No muestra mensajes
 * propios: el aviso de "no disponible" lo muestra quien lo usa (una sola vez, ver Login).
 */
const TurnstileWidget = forwardRef<TurnstileHandle, Props>(({ onToken, onUnavailable }, ref) => {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const api = useRef<TurnstileApi | undefined>(undefined);
  const alive = useRef(true);
  const mounting = useRef(false);
  // Los callbacks cambian en cada render del padre; el widget se crea una sola vez y usa siempre los vigentes.
  const callbacks = useRef({ onToken, onUnavailable });
  callbacks.current = { onToken, onUnavailable };

  /** Carga el script y crea el widget; no hace nada si ya existe o hay una carga en curso. */
  const mount = useCallback(() => {
    if (mounting.current || widgetId.current !== undefined) return;
    mounting.current = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!alive.current || !container.current) return;
        api.current = turnstile;
        widgetId.current = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          size: 'flexible',
          theme: 'auto',
          language: 'es',
          callback: (token: string) => {
            callbacks.current.onUnavailable?.(false);
            callbacks.current.onToken(token);
          },
          'expired-callback': () => callbacks.current.onToken(null),
          'timeout-callback': () => callbacks.current.onToken(null),
          'error-callback': () => {
            callbacks.current.onToken(null);
            callbacks.current.onUnavailable?.(true);
          },
        });
      })
      .catch(() => {
        if (alive.current) callbacks.current.onUnavailable?.(true);
      })
      .finally(() => {
        mounting.current = false;
      });
  }, []);

  const reset = useCallback(() => {
    callbacks.current.onToken(null);
    if (api.current && widgetId.current !== undefined) api.current.reset(widgetId.current);
    else mount();
  }, [mount]);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    alive.current = true;
    mount();
    // Si la red vuelve despues de un fallo, se reintenta solo.
    window.addEventListener('online', reset);

    return () => {
      alive.current = false;
      window.removeEventListener('online', reset);
      if (api.current && widgetId.current !== undefined) api.current.remove(widgetId.current);
      widgetId.current = undefined;
      callbacks.current.onToken(null);
    };
  }, [mount, reset]);

  return <div ref={container} data-testid="turnstile-container" className="turnstile-box" />;
});

TurnstileWidget.displayName = 'TurnstileWidget';
export default TurnstileWidget;
