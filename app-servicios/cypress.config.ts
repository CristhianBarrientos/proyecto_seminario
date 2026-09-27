import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    // Ionic (Stencil) renderiza sus inputs reales dentro de Shadow DOM
    // (ion-input, ion-select, etc.) - sin esto cy.get()/cy.contains() no
    // encuentran los <input> nativos.
    includeShadowDom: true,
    setupNodeEvents(on, config) {
      return config;
    },
    env: {
      // Anon key pública del stack local de Supabase (ver
      // supabase/docker/.env, proyecto "proyecto-seminario-local") - no es
      // secreta, está protegida por RLS igual que en cualquier app
      // Supabase. Los tests e2e corren SOLO contra el stack local, nunca
      // contra OCI: no hay riesgo de crear cuentas de prueba en producción.
      supabaseUrl: "http://localhost:8000",
      supabaseAnonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InByb3llY3RvLXNlbWluYXJpby1sb2NhbCIsImlhdCI6MTc5MDIyNjQyMywiZXhwIjoyMTA1NTg2NDIzfQ.JIRk_1kwiBwPFvXUGYqT8DV22caU50SW5Z-fR1UT1us",
    },
  },
});
