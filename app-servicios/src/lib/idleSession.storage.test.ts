import { afterEach, describe, expect, it } from 'vitest';
import {
  clearIdleLogoutFlag, clearLastActivity, flagIdleLogout, peekIdleLogoutFlag, readLastActivity,
  writeLastActivity,
} from './idleSession';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('última actividad (localStorage)', () => {
  it('devuelve null si no hay marca', () => {
    expect(readLastActivity()).toBeNull();
  });

  it('escribe y lee el timestamp', () => {
    writeLastActivity(123456);
    expect(readLastActivity()).toBe(123456);
  });

  it('trata un valor corrupto como ausente', () => {
    window.localStorage.setItem('session:lastActivity', 'no-es-un-numero');
    expect(readLastActivity()).toBeNull();
  });

  it('clearLastActivity borra la marca', () => {
    writeLastActivity(1);
    clearLastActivity();
    expect(readLastActivity()).toBeNull();
  });
});

describe('aviso de cierre por inactividad (sessionStorage)', () => {
  it('peek no consume la marca: se puede leer más de una vez (inicializador puro, StrictMode)', () => {
    flagIdleLogout();
    expect(peekIdleLogoutFlag()).toBe(true);
    expect(peekIdleLogoutFlag()).toBe(true);
  });

  it('clearIdleLogoutFlag la retira (tras mostrarla, o si el cierre falló)', () => {
    flagIdleLogout();
    clearIdleLogoutFlag();
    expect(peekIdleLogoutFlag()).toBe(false);
  });

  it('sin marca no hay aviso', () => {
    expect(peekIdleLogoutFlag()).toBe(false);
  });
});
