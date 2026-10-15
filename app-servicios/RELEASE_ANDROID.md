# Publicar el APK de Ya Quedó

La app Android es la misma web empaquetada con Capacitor (`umg.yaquedo.app`). Este documento es el procedimiento
para compilar, firmar y publicar una versión. Se hace **desde Windows**, con PowerShell.

## Una sola vez

1. **Entorno de producción.** Copiar `.env.production.example` a `.env.production.local` (queda ignorado por git) y
   poner la anon key de **producción**, la misma que usa `app.yaquedo.shop`. La URL debe ser `https://api.yaquedo.shop`.
   El APK *hornea* estos valores: el `.env` de desarrollo apunta a `localhost` y no sirve en un celular.
2. **Llave de firma.** `powershell -ExecutionPolicy Bypass -File scripts\android\create-keystore.ps1`
   - Crea `%USERPROFILE%\.yaquedo\yaquedo-release.jks`. Elegí una contraseña larga.
   - **Hacé copia del `.jks` y de la contraseña, en lugares separados.** Si se pierde la llave nadie puede actualizar
     la app: hay que desinstalarla y reinstalarla. Nunca va a git ni al chat.

## Cada versión

1. Subir `versionCode` (entero, +1 en cada versión) y `versionName` en `android/app/build.gradle`.
2. `powershell -ExecutionPolicy Bypass -File scripts\android\build-apk.ps1` (pide la contraseña por consola).
   - Aborta si la URL no es la de producción o si el resultado compilado contiene `localhost:8000`.
   - Deja `dist-apk\yaquedo.apk` y muestra versión, tamaño y SHA-256.
3. Publicar en GitHub Releases. **El archivo debe llamarse siempre `yaquedo.apk`** (la landing usa
   `releases/latest/download/yaquedo.apk`):
   `gh release create v1.0.0 dist-apk\yaquedo.apk --title "Ya Quedó 1.0.0" --notes "..."`
   No marcarlo como *pre-release*: `latest` los ignora y el enlace de la landing daría 404.
4. Actualizar `src/lib/appRelease.ts` con `version`, `sizeMb` y `sha256` y hacer PR. La landing solo muestra la
   descarga cuando `version` **y** `sha256` están completos.

## Qué verificar antes de publicar

- Instalarlo en un celular real: `adb install -r dist-apk\yaquedo.apk`, iniciar sesión y recorrer los flujos.
- `sha256sum`/`Get-FileHash` del archivo publicado debe coincidir con el de la landing.

## Notas

- Android avisa de "origen desconocido" al instalar y Play Protect puede advertir: es lo esperado fuera de Play Store.
- Las actualizaciones son manuales: quien tenga una versión vieja descarga la nueva e instala encima (misma firma).
- Permisos actuales: solo `INTERNET`. La ubicación aproximada (`ACCESS_COARSE_LOCATION`, **nunca** la precisa) y las
  notificaciones push (FCM) son de las próximas fases y se declaran junto con el código que las usa.
