/// <reference types="cypress" />

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Crea una cuenta directo contra la API de GoTrue (sin pasar por la
       * UI de Login) para dejar un usuario conocido listo antes de un test
       * que no está probando el flujo de signup en sí (ej. login, feed).
       * El stack local tiene autoconfirm habilitado, así que el usuario
       * queda listo para loguear de inmediato.
       */
      apiSignup(email: string, password: string, fullName: string, role: 'cliente' | 'profesional'): Chainable<void>;
    }
  }
}

Cypress.Commands.add('apiSignup', (email, password, fullName, role) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('supabaseUrl')}/auth/v1/signup`,
    headers: { apikey: Cypress.env('supabaseAnonKey') },
    body: {
      email,
      password,
      data: { full_name: fullName, role },
    },
  });
});

export {};
