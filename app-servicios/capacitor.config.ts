import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Identidad de la app en Android. NO cambiar despues de distribuir el primer APK: Android la usa para
  // reconocer actualizaciones, y cambiarla instala una app distinta junto a la anterior.
  appId: 'umg.yaquedo.app',
  appName: 'Ya Quedó',
  webDir: 'dist',
  android: {
    // Todo el trafico va por HTTPS (api.yaquedo.shop): no se permite contenido mixto.
    allowMixedContent: false,
  },
  server: {
    // El WebView sirve la app desde https://localhost; la API ya acepta ese origen (CORS verificado).
    androidScheme: 'https',
  },
};

export default config;
