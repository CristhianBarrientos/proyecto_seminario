import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Config de Vite SOLO para el build del APK (`npm run build:android`). La web (app.yaquedo.shop) sigue usando
// vite.config.ts, que NO se toca: en OCI ese archivo tiene un cambio local y modificarlo en el repo haria
// que el proximo `git pull` fallara por conflicto.
//
// Diferencia: sin @vitejs/plugin-legacy. Ese plugin genera una SEGUNDA copia de todo el JS para navegadores
// viejos (~0.57 MB comprimidos dentro del APK). Una app Android usa el WebView del sistema, que se actualiza
// por Play Store; con minSdk 24 no hace falta la copia legacy.
export default defineConfig({
  plugins: [react()],
})
