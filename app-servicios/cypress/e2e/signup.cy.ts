describe('Signup', () => {
  beforeEach(() => {
    cy.visit('/login');
    cy.contains('ion-segment-button', 'Crear cuenta').click();
  });

  const next = () => cy.contains('ion-button', 'Continuar').click();

  it('arranca en el paso 1 y no avanza con el nombre inválido', () => {
    cy.contains('Paso 1 de 3').should('be.visible');

    cy.get('input[type="text"]').first().type('X'); // nombre inválido: una sola letra
    next();

    cy.contains('Ingresá tu nombre y apellido').should('be.visible');
    cy.contains('Paso 1 de 3').should('be.visible');
    cy.location('pathname').should('eq', '/login');
  });

  it('no avanza del paso 2 con un correo inválido', () => {
    cy.get('input[type="text"]').first().type('Usuario De Prueba');
    next();

    cy.contains('Paso 2 de 3').should('be.visible');
    cy.get('input[type="email"]').type('correo-invalido');
    next();

    cy.contains('Ingresá un correo válido').should('be.visible');
    cy.contains('Paso 2 de 3').should('be.visible');
  });

  it('muestra los requisitos de contraseña y no deja crear la cuenta hasta cumplirlos', () => {
    cy.get('input[type="text"]').first().type('Usuario De Prueba');
    next();
    cy.get('input[type="email"]').type(`e2e-signup-debil-${Date.now()}@test.local`);
    next();

    cy.contains('Paso 3 de 3').should('be.visible');
    cy.get('input[type="password"]').type('abc');
    cy.contains('ion-button', 'Crear mi cuenta').click();

    cy.contains('La contraseña todavía no cumple todos los requisitos').should('be.visible');
    cy.location('pathname').should('eq', '/login');
  });

  it('permite volver al paso anterior sin perder lo escrito', () => {
    cy.get('input[type="text"]').first().type('Usuario De Prueba');
    next();
    cy.contains('Paso 2 de 3').should('be.visible');

    cy.contains('ion-button', 'Atrás').click();

    cy.contains('Paso 1 de 3').should('be.visible');
    cy.get('input[type="text"]').first().should('have.value', 'Usuario De Prueba');
  });

  it('crea la cuenta con datos válidos y redirige al feed', () => {
    const email = `e2e-signup-${Date.now()}@test.local`;

    cy.get('input[type="text"]').first().type('Usuario De Prueba');
    next();
    cy.get('input[type="email"]').type(email);
    next();
    cy.get('input[type="password"]').type('Test1234!');
    cy.contains('ion-button', 'Crear mi cuenta').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/tabs/home');
    cy.contains('Servicios cerca de ti').should('be.visible');
  });
});
