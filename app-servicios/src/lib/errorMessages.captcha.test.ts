import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFriendlyErrorMessage } from './errorMessages';

describe('errores de captcha (Turnstile) de GoTrue', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    [{ code: 'captcha_failed', message: 'captcha protection: request disallowed (invalid-input-response)', status: 400 }],
    [{ message: 'captcha verification process failed' }],
  ])('%j -> mensaje claro, sin texto crudo del servidor', (err) => {
    const msg = getFriendlyErrorMessage(err);
    expect(msg).toBe('No pudimos verificar que eres una persona. Recargá la página e intentá de nuevo.');
    expect(msg.toLowerCase()).not.toContain('invalid-input');
  });

  it('no altera el mensaje de credenciales incorrectas', () => {
    expect(getFriendlyErrorMessage({ message: 'Invalid login credentials' })).toBe('El correo o la contraseña no son correctos.');
  });
});
