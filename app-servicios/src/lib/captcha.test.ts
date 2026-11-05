import { afterEach, describe, expect, it, vi } from 'vitest';

// captchaEnabled se calcula al cargar el modulo: cada caso fija el env y lo importa de nuevo.
async function loadCaptcha(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey ?? '');
  return import('./captcha');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('captcha apagado (sin site key)', () => {
  it('no esta habilitado y no envia token aunque exista', async () => {
    const { captchaEnabled, captchaOptions } = await loadCaptcha(undefined);
    expect(captchaEnabled).toBe(false);
    expect(captchaOptions('token-cualquiera')).toBeUndefined();
  });

  it('una site key en blanco cuenta como apagado', async () => {
    const { captchaEnabled } = await loadCaptcha('   ');
    expect(captchaEnabled).toBe(false);
  });
});

describe('captcha encendido', () => {
  it('envia el token a GoTrue como captchaToken', async () => {
    const { captchaEnabled, captchaOptions, TURNSTILE_SITE_KEY } = await loadCaptcha(' 1x00000000000000000000AA ');
    expect(captchaEnabled).toBe(true);
    expect(TURNSTILE_SITE_KEY).toBe('1x00000000000000000000AA');
    expect(captchaOptions('tok-123')).toEqual({ captchaToken: 'tok-123' });
  });

  it('sin token no manda opciones', async () => {
    const { captchaOptions } = await loadCaptcha('1x00000000000000000000AA');
    expect(captchaOptions(null)).toBeUndefined();
  });
});

describe('loadTurnstile: recuperacion tras un fallo de carga', () => {
  const scripts = () => [...document.head.querySelectorAll('script')].filter((s) => s.src.includes('turnstile'));

  afterEach(() => {
    scripts().forEach((s) => s.remove());
    delete window.turnstile;
  });

  it('onerror: rechaza, quita el script y el siguiente intento vuelve a pedirlo', async () => {
    const { loadTurnstile } = await loadCaptcha('1x00000000000000000000AA');
    const first = loadTurnstile();
    expect(scripts()).toHaveLength(1);
    scripts()[0].onerror?.(new Event('error'));
    await expect(first).rejects.toThrow();
    expect(scripts()).toHaveLength(0);

    const second = loadTurnstile();
    expect(scripts()).toHaveLength(1);
    window.turnstile = { render: () => 'w', reset: () => {}, remove: () => {} };
    scripts()[0].onload?.(new Event('load'));
    await expect(second).resolves.toBe(window.turnstile);
  });

  it('onload sin window.turnstile: tambien libera la promesa (no hereda el rechazo)', async () => {
    const { loadTurnstile } = await loadCaptcha('1x00000000000000000000AA');
    const first = loadTurnstile();
    scripts()[0].onload?.(new Event('load')); // api.js "cargo" pero no definio window.turnstile
    await expect(first).rejects.toThrow('turnstile no disponible');
    expect(scripts()).toHaveLength(0);

    const second = loadTurnstile();
    expect(second).not.toBe(first);
    expect(scripts()).toHaveLength(1);
    second.catch(() => {});
  });
});
