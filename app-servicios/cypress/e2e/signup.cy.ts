describe('Signup', () => {
  beforeEach(() => {
    cy.visit('/login');
    cy.contains('ion-segment-button', 'Crear cuenta').click();
  });

  it('bloquea el envío con datos inválidos y muestra el error puntual de cada campo', () => {
    cy.get('input[type="text"]').first().type('X'); // nombre inválido: una sola letra
    cy.get('input[type="email"]').type('correo-invalido');
    cy.get('input[type="password"]').type('123'); // menor al mínimo

    cy.contains('ion-button', 'Registrarme').click();

    cy.contains('Ingresá tu nombre y apellido').should('be.visible');
    cy.contains('Ingresá un correo válido').should('be.visible');
    cy.contains('La contraseña debe tener al menos').should('be.visible');
    // No debe haber navegado: la validación de cliente corta antes del request.
    cy.location('pathname').should('eq', '/login');
  });

  it('crea la cuenta con datos válidos y redirige al feed', () => {
    const email = `e2e-signup-${Date.now()}@test.local`;

    cy.get('input[type="text"]').first().type('Usuario De Prueba');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type('Test1234');

    cy.contains('ion-button', 'Registrarme').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/tabs/home');
    cy.contains('Servicios cerca de ti').should('be.visible');
  });
});
