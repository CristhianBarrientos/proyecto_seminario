import { describe, expect, it } from 'vitest';
import { apkReleaseProblem, isApkAvailable } from './appRelease';

const SHA = 'a'.repeat(64);

describe('isApkAvailable', () => {
  it('sin APK publicado no hay descarga', () => {
    expect(isApkAvailable({ version: null, sha256: null })).toBe(false);
  });

  it('con version y SHA-256 hay descarga', () => {
    expect(isApkAvailable({ version: '1.0.0', sha256: SHA })).toBe(true);
  });

  it('con version pero sin SHA-256 NO se ofrece el binario', () => {
    expect(isApkAvailable({ version: '1.0.0', sha256: null })).toBe(false);
  });

  it('con SHA-256 pero sin version tampoco', () => {
    expect(isApkAvailable({ version: null, sha256: SHA })).toBe(false);
  });
});

describe('apkReleaseProblem', () => {
  it('no avisa cuando no hay APK ni datos a medias', () => {
    expect(apkReleaseProblem({ version: null, sha256: null })).toBeNull();
    expect(apkReleaseProblem({ version: null, sha256: SHA })).toBeNull();
  });

  it('no avisa con la publicacion completa', () => {
    expect(apkReleaseProblem({ version: '1.0.0', sha256: SHA })).toBeNull();
  });

  it('avisa cuando hay version pero falta el SHA-256 (la landing seguiria diciendo "pronto" en silencio)', () => {
    expect(apkReleaseProblem({ version: '1.0.0', sha256: null })).toMatch(/sha256/);
  });
});
