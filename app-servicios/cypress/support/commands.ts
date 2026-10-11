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
      /**
       * Loguea por la UI de /login con email y password y espera la redireccion al feed.
       * Centraliza el flujo para que un cambio en el markup del form se edite en un solo lugar.
       */
      login(email: string, password: string): Chainable<void>;
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

Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login');
  cy.get('input[type="email"]').type(email);
  cy.get('input[type="password"]').type(password);
  cy.contains('ion-button', 'Entrar').click();
  cy.location('pathname', { timeout: 10000 }).should('eq', '/tabs/home');
});

export {};
