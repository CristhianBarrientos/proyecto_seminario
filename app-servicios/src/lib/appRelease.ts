/**
 * Datos de la app para la landing. El APK se publica como asset de un GitHub
 * Release (la app no va a Play Store). Al sacar una versión nueva solo hay que
 * actualizar `version`, `sizeMb` y `sha256` (el SHA-256 se calcula con
 * `Get-FileHash yaquedo.apk -Algorithm SHA256`); la URL apunta siempre al
 * último release, mientras el asset se llame igual.
 */
export const APP_NAME = 'Ya Quedó';

export const APK_RELEASE = {
  url: 'https://github.com/CristhianBarrientos/proyecto_seminario/releases/latest/download/yaquedo.apk',
  releasesPage: 'https://github.com/CristhianBarrientos/proyecto_seminario/releases/latest',
  // null mientras no exista un APK publicado: la landing muestra "próximamente". La descarga solo se
  // ofrece cuando hay `version` Y `sha256` (no se publica un binario sin checksum).
  version: null as string | null,
  sizeMb: null as number | null,
  sha256: null as string | null,
};
