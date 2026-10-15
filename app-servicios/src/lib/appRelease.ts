/**
 * Datos de la app para la landing. El APK se publica como asset de un GitHub
 * Release (la app no va a Play Store). Al sacar una versión nueva solo hay que
 * actualizar `version`, `sizeMb` y `sha256` (el SHA-256 se calcula con
 * `Get-FileHash yaquedo.apk -Algorithm SHA256`); la URL apunta siempre al
 * último release, mientras el asset se llame igual.
 */
export const APP_NAME = 'Ya Quedó';

export interface ApkRelease {
  url: string;
  releasesPage: string;
  version: string | null;
  sizeMb: number | null;
  sha256: string | null;
}

/** La descarga solo se ofrece con version Y SHA-256: no se publica un binario externo sin checksum. */
export function isApkAvailable(release: Pick<ApkRelease, 'version' | 'sha256'>): boolean {
  return release.version !== null && release.sha256 !== null;
}

/**
 * Combinacion inconsistente: se publico `version` pero falta `sha256`. La landing sigue diciendo
 * "disponible pronto" aunque el APK exista, asi que se avisa en consola en vez de fallar en silencio.
 */
export function apkReleaseProblem(release: Pick<ApkRelease, 'version' | 'sha256'>): string | null {
  if (release.version !== null && release.sha256 === null) {
    return 'APK_RELEASE tiene `version` pero no `sha256`: la landing no ofrece la descarga hasta completarlo.';
  }
  return null;
}

export const APK_RELEASE: ApkRelease = {
  url: 'https://github.com/CristhianBarrientos/proyecto_seminario/releases/latest/download/yaquedo.apk',
  releasesPage: 'https://github.com/CristhianBarrientos/proyecto_seminario/releases/latest',
  // null mientras no exista un APK publicado: la landing muestra "próximamente". La descarga solo se
  // ofrece cuando hay `version` Y `sha256` (no se publica un binario sin checksum).
  version: null,
  sizeMb: null,
  sha256: null,
};
