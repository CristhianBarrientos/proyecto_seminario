import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadTurnstile, TURNSTILE_SITE_KEY, type TurnstileApi } from '../lib/captcha';

export interface TurnstileHandle {
  /** Los tokens de Turnstile son de un solo uso: hay que pedir uno nuevo despues de cada intento. */
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
 * necesita que la persona haga algo. Renderiza solo si hay site key (ver lib/captcha.ts).
 */
const TurnstileWidget = forwardRef<TurnstileHandle, Props>(({ onToken, onUnavailable }, ref) => {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const api = useRef<TurnstileApi | undefined>(undefined);
  // Los callbacks cambian en cada render del padre; el widget se crea una sola vez y usa siempre los vigentes.
  const callbacks = useRef({ onToken, onUnavailable });
  callbacks.current = { onToken, onUnavailable };
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset: () => {
      callbacks.current.onToken(null);
      if (api.current && widgetId.current !== undefined) api.current.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        api.current = turnstile;
        widgetId.current = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          size: 'flexible',
          theme: 'auto',
          language: 'es',
          callback: (token: string) => {
            callbacks.current.onUnavailable?.(false);
            setFailed(false);
            callbacks.current.onToken(token);
          },
          'expired-callback': () => callbacks.current.onToken(null),
          'timeout-callback': () => callbacks.current.onToken(null),
          'error-callback': () => {
            callbacks.current.onToken(null);
            callbacks.current.onUnavailable?.(true);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        callbacks.current.onUnavailable?.(true);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      if (api.current && widgetId.current !== undefined) api.current.remove(widgetId.current);
      widgetId.current = undefined;
      callbacks.current.onToken(null);
    };
  }, []);

  return (
    <div className="turnstile-box">
      <div ref={container} data-testid="turnstile-container" />
      {failed && (
        <p className="field-error" role="alert">
          No pudimos cargar la verificación de seguridad. Revisá tu conexión o desactivá el bloqueador de contenido y recargá.
        </p>
      )}
    </div>
  );
});

TurnstileWidget.displayName = 'TurnstileWidget';
export default TurnstileWidget;
