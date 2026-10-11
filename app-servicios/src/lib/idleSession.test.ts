import { describe, expect, it } from 'vitest';
import { IDLE_LIMIT_MS, IDLE_WARNING_MS, idleState, secondsUntilExpiry } from './idleSession';

const MIN = 60 * 1000;

describe('idleState', () => {
  it('está activo mientras no se acerque al límite', () => {
    expect(idleState(0, 0)).toBe('active');
    expect(idleState(28 * MIN + 59_999, 0)).toBe('active');
  });

  it('avisa desde los 29 min (límite 30 menos 1 min de aviso)', () => {
    expect(idleState(29 * MIN, 0)).toBe('warning');
    expect(idleState(30 * MIN - 1, 0)).toBe('warning');
  });

  it('expira exactamente a los 30 min', () => {
    expect(idleState(30 * MIN, 0)).toBe('expired');
    expect(idleState(8 * 60 * MIN, 0)).toBe('expired');
  });

  it('una interacción reinicia el conteo', () => {
    const last = 29 * MIN; // el usuario volvió justo en el aviso
    expect(idleState(29 * MIN + 1, last)).toBe('active');
    expect(idleState(last + 29 * MIN, last)).toBe('warning');
  });

  it('si el reloj retrocede (última actividad en el futuro) sigue activo', () => {
    expect(idleState(1000, 5000)).toBe('active');
  });

  it('respeta límites personalizados', () => {
    expect(idleState(9_000, 0, 10_000, 2_000)).toBe('warning');
    expect(idleState(10_000, 0, 10_000, 2_000)).toBe('expired');
  });
});

describe('secondsUntilExpiry', () => {
  it('redondea hacia arriba y nunca es negativo', () => {
    expect(secondsUntilExpiry(IDLE_LIMIT_MS - IDLE_WARNING_MS, 0)).toBe(60);
    expect(secondsUntilExpiry(IDLE_LIMIT_MS - 59_001, 0)).toBe(60);
    expect(secondsUntilExpiry(IDLE_LIMIT_MS - 500, 0)).toBe(1);
    expect(secondsUntilExpiry(IDLE_LIMIT_MS + 5_000, 0)).toBe(0);
  });
});
