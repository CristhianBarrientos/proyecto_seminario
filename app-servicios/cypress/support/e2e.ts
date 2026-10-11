// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Respaldo en runtime del guard de cypress.config.ts: ese guard lee el .env, pero el dev server es
// un proceso aparte que pudo arrancar con otro VITE_SUPABASE_URL. Cualquier alta hacia un host que
// no sea local se bloquea antes de salir, sin importar como se levanto el servidor.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

beforeEach(() => {
  cy.intercept('POST', '**/auth/v1/signup', (req) => {
    if (!LOCAL_HOSTS.includes(new URL(req.url).hostname)) {
      req.destroy();
      throw new Error(`[e2e] Signup bloqueado hacia un host no local: ${req.url}. La app apunta fuera del stack local.`);
    }
  });
});
