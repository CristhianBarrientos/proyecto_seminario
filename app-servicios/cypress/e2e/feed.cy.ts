describe('Feed de servicios', () => {
  const password = 'Test1234';
  const email = `e2e-feed-${Date.now()}@test.local`;

  before(() => {
    cy.apiSignup(email, password, 'Usuario Prueba', 'cliente');
  });

  beforeEach(() => {
    cy.visit('/login');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('ion-button', 'Entrar').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/tabs/home');
  });

  it('lista los profesionales demo con nombre, categoría y precio', () => {
    // Datos demo del stack local (schema-inicial.sql / seed): 10 profesionales
    // con servicios activos, entre ellos "Carlos Méndez" (Electricista).
    cy.contains('.service-card', 'Carlos Méndez').should('be.visible');
    cy.contains('.service-card', 'Electricista').should('be.visible');
    cy.get('.service-card').should('have.length.greaterThan', 1);
  });

  it('filtra el feed al buscar por nombre', () => {
    cy.get('ion-searchbar input').type('Carlos');

    cy.get('.service-card').should('have.length', 1);
    cy.contains('.service-card', 'Carlos Méndez').should('be.visible');
  });

  it('muestra el detalle del profesional al hacer click en su tarjeta', () => {
    // { force: true }: el header de Ionic queda sticky sobre el scroll del
    // contenido y Cypress lo detecta como "tapando" la tarjeta aunque
    // visualmente no se superponen - no es un bug de la UI.
    cy.contains('.service-card', 'Carlos Méndez').click({ force: true });

    cy.location('pathname').should('include', '/tabs/home/');
    cy.contains('Perfil del profesional').should('be.visible');
    cy.contains('Carlos Méndez').should('be.visible');
  });
});
