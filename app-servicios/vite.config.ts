/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy()
  ],
  server: {
    // hosts con los que se accede al dev server: el dominio público (detrás de Cloudflare) y túneles temporales
    // para compartirlo con el equipo - no afecta al backend, que sigue siendo OCI
    allowedHosts: ['app.yaquedo.shop', '.trycloudflare.com'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  }
})
