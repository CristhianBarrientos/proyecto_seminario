/**
 * Captcha (Cloudflare Turnstile) para signup y login.
 *
 * Es OPCIONAL por entorno: sin `VITE_TURNSTILE_SITE_KEY` no se muestra widget ni se envia token, y la app se
 * comporta como antes. Eso permite desplegar el front ANTES de activar el captcha en GoTrue (variable
 * GOTRUE_SECURITY_CAPTCHA_ENABLED): el orden correcto es front/APK primero, servidor despues, porque con el
 * captcha activo en el servidor todo cliente sin token (APK viejo, curl, Postman) recibe 400 `captcha_failed`.
 *
 * La site key es publica por diseno (como la anon key); la secret key vive solo en el .env del servidor.
 */
export const TURNSTILE_SITE_KEY: string = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

export const captchaEnabled = TURNSTILE_SITE_KEY.length > 0;

/** Opciones de auth con el token de captcha; `undefined` si el captcha no esta activo o no hay token. */
export function captchaOptions(token: string | null): { captchaToken: string } | undefined {
  return captchaEnabled && token ? { captchaToken: token } : undefined;
}

export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Carga api.js una sola vez. Si falla (sin red, bloqueado), se puede reintentar en el siguiente intento. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    // Cualquier fallo (red, bloqueador, o api.js cargado pero sin window.turnstile) libera la promesa cacheada y
    // quita la etiqueta, para que el siguiente intento vuelva a pedir el script en vez de heredar el rechazo.
    const fail = (message: string) => {
      script.remove();
      scriptPromise = null;
      reject(new Error(message));
    };
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail('turnstile no disponible'));
    script.onerror = () => fail('No se pudo cargar Turnstile');
    document.head.appendChild(script);
  });
  return scriptPromise;
}
