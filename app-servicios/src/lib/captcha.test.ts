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
