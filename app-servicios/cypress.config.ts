import { defineConfig } from "cypress";
import { loadEnv } from "vite";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// El test de signup por UI pasa por el cliente de Supabase de la app (VITE_SUPABASE_URL), no por
// `env.supabaseUrl` de abajo. Si el dev server arranca con un .env apuntando a OCI, la suite
// crearia cuentas de prueba en infra compartida. Se resuelve el mismo env que usaria `vite dev`
// (.env, .env.local, .env.development*, variables del proceso) y se aborta si no es local.
function assertAppPointsToLocalSupabase(): void {
  const url = loadEnv("development", process.cwd(), "VITE_").VITE_SUPABASE_URL;
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    // url vacia o malformada: se trata como no-local
  }
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `[e2e] Abortado: VITE_SUPABASE_URL="${url ?? ""}" no apunta a localhost/127.0.0.1. ` +
        "Los tests e2e crean cuentas reales y solo deben correr contra el stack local. " +
        "Arranca el dev server con VITE_SUPABASE_URL=http://localhost:8000 (y la anon key local) " +
        "o en un .env.local, y vuelve a correr la suite.",
    );
  }
}

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    // Ionic (Stencil) renderiza sus inputs reales dentro de Shadow DOM
    // (ion-input, ion-select, etc.) - sin esto cy.get()/cy.contains() no
    // encuentran los <input> nativos.
    includeShadowDom: true,
    setupNodeEvents(on, config) {
      assertAppPointsToLocalSupabase();
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
