import { defineConfig } from "cypress";
import { loadEnv } from "vite";

// Con WHATWG URL, hostname de una IPv6 conserva los corchetes ("[::1]").
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalUrl(value: string | undefined): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(value ?? "").hostname);
  } catch {
    return false; // vacia o malformada: se trata como no-local
  }
}

// El test de signup por UI pasa por el cliente de Supabase de la app (VITE_SUPABASE_URL), no por
// `env.supabaseUrl` de abajo. Si el dev server arranca con un .env apuntando a OCI, la suite
// crearia cuentas de prueba en infra compartida. Se resuelve el mismo env que usaria `vite dev`
// (.env, .env.local, .env.development*, variables del proceso) y se aborta si no es local.
function assertAppPointsToLocalSupabase(testEnvSupabaseUrl: string | undefined): void {
  const appUrl = loadEnv("development", process.cwd(), "VITE_").VITE_SUPABASE_URL;
  for (const [name, url] of [["VITE_SUPABASE_URL", appUrl], ["env.supabaseUrl (cypress.config.ts)", testEnvSupabaseUrl]] as const) {
    if (!isLocalUrl(url)) {
      throw new Error(
        `[e2e] Abortado: ${name}="${url ?? ""}" no apunta a localhost/127.0.0.1. ` +
          "Los tests e2e crean cuentas reales y solo deben correr contra el stack local. " +
          "Arranca el dev server con `npm run dev.e2e` (escucha en 127.0.0.1) y con " +
          "VITE_SUPABASE_URL=http://localhost:8000 (y la anon key local) en el entorno o en .env.local. " +
          "Respaldo en runtime: cypress/support/e2e.ts bloquea signups hacia hosts no locales.",
      );
    }
  }
}

export default defineConfig({
  e2e: {
    // Levantar el dev server con `npm run dev.e2e`: con Node 24 `vite` a secas escucha solo en ::1 y
    // Cypress conecta a 127.0.0.1 (ECONNREFUSED).
    baseUrl: "http://localhost:5173",
    // Ionic (Stencil) renderiza sus inputs reales dentro de Shadow DOM
    // (ion-input, ion-select, etc.) - sin esto cy.get()/cy.contains() no
    // encuentran los <input> nativos.
    includeShadowDom: true,
    setupNodeEvents(on, config) {
      assertAppPointsToLocalSupabase(config.env.supabaseUrl as string | undefined);
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
