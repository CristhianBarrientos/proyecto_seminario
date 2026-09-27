describe('Login', () => {
  const password = 'Test1234';
  const email = `e2e-login-${Date.now()}@test.local`;

  before(() => {
    cy.apiSignup(email, password, 'Usuario Prueba', 'cliente');
  });

  beforeEach(() => {
    cy.visit('/login');
  });

  it('muestra un mensaje amigable con credenciales inválidas', () => {
    cy.get('input[type="email"]').type('no-existe@test.local');
    cy.get('input[type="password"]').type('password-incorrecta');
    cy.contains('ion-button', 'Entrar').click();

    cy.contains('El correo o la contraseña no son correctos.').should('be.visible');
    cy.location('pathname').should('eq', '/login');
  });

  it('loguea con credenciales válidas y redirige al feed', () => {
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('ion-button', 'Entrar').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/tabs/home');
    cy.contains('Servicios cerca de ti').should('be.visible');
  });
});
