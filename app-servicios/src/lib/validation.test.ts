import { describe, expect, it } from 'vitest';
import {
  MIN_LOGIN_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SPECIALS,
  checkPasswordRules,
  isStrongPassword,
} from './validation';

describe('política de contraseña al crear cuenta', () => {
  it.each([
    ['Test1234!', true],
    ['Abcdef1_', true],
    ['abcdefg1!', false], // sin mayúscula
    ['ABCDEFG1!', true],
    ['Abcdefgh!', false], // sin número
    ['Abcdefg12', false], // sin especial
    ['Ab1!', false], // muy corta
    ['', false],
  ])('%s -> %s', (password, expected) => {
    expect(isStrongPassword(password)).toBe(expected);
  });

  it('exige exactamente MIN_PASSWORD_LENGTH caracteres como mínimo', () => {
    const ok = 'Aa1!' + 'x'.repeat(MIN_PASSWORD_LENGTH - 4);
    expect(ok).toHaveLength(MIN_PASSWORD_LENGTH);
    expect(isStrongPassword(ok)).toBe(true);
    expect(isStrongPassword(ok.slice(1))).toBe(false);
  });

  it('una "Ñ" no cuenta como mayúscula (el servidor compara ASCII)', () => {
    expect(isStrongPassword('ñÑñÑñÑ1!')).toBe(false);
  });

  it('ni ":" ni "\\" cuentan como carácter especial (separador y escape de GoTrue)', () => {
    expect(PASSWORD_SPECIALS).not.toContain(':');
    expect(PASSWORD_SPECIALS).not.toContain('\\');
    expect(isStrongPassword('Abcdefg1:')).toBe(false);
    expect(isStrongPassword('Abcdefg1\\')).toBe(false);
  });

  it('checkPasswordRules informa el estado de cada requisito', () => {
    const status = Object.fromEntries(checkPasswordRules('abc').map((r) => [r.id, r.ok]));
    expect(status).toEqual({ length: false, upper: false, number: false, special: false });

    const full = Object.fromEntries(checkPasswordRules('Test1234!').map((r) => [r.id, r.ok]));
    expect(full).toEqual({ length: true, upper: true, number: true, special: true });
  });
});

describe('inicio de sesión', () => {
  it('no exige la política nueva: cuentas con reglas anteriores deben seguir entrando', () => {
    expect(MIN_LOGIN_PASSWORD_LENGTH).toBeLessThan(MIN_PASSWORD_LENGTH);
  });
});
