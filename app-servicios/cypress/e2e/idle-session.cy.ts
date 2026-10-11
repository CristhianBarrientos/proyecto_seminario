// Cierre de sesión por inactividad (issue #56): 30 min sin interacción, aviso a los 29.
// El reloj se adelanta con cy.clock/cy.tick en lugar de esperar tiempo real. Solo se falsean
// setInterval y Date (lo que usa IdleSessionGuard): dejar setTimeout real evita colgar el login.
const MIN = 60 * 1000;

describe('Cierre de sesión por inactividad', () => {
  const password = 'Test1234';
  const email = `e2e-idle-${Date.now()}@test.local`;

  before(() => {
    cy.apiSignup(email, password, 'Usuario Inactivo', 'cliente');
  });

  beforeEach(() => {
    cy.clock(Date.now(), ['setInterval', 'clearInterval', 'Date']);
    cy.login(email, password);
    // cy.login termina cuando la URL cambia a /tabs/home, pero IdleSessionGuard se monta un
    // instante después. Si el tick corriera antes, el guard arrancaria con el reloj ya adelantado
    // y mediria la inactividad desde ahi. Se espera la señal real: que haya escrito su marca.
    cy.window().its('localStorage').invoke('getItem', 'session:lastActivity').should('not.be.null');
  });

  it('avisa a los 29 min y cierra la sesión a los 30', () => {
    cy.contains('Tu sesión se cerrará').should('not.exist');

    cy.tick(29 * MIN);
    cy.contains('Tu sesión se cerrará por inactividad').should('be.visible');
    cy.location('pathname').should('eq', '/tabs/home');

    cy.tick(MIN + 2000);
    cy.location('pathname', { timeout: 10000 }).should('eq', '/login');
    cy.contains('Tu sesión se cerró por inactividad').should('be.visible');
  });

  it('una interacción durante el aviso lo descarta y reinicia el conteo', () => {
    cy.tick(29 * MIN);
    cy.contains('Tu sesión se cerrará por inactividad').should('be.visible');

    cy.get('body').trigger('pointerdown');
    cy.contains('Tu sesión se cerrará').should('not.exist');

    // 28 min más: desde la interacción todavía no se llega ni al aviso, y la sesión sigue.
    cy.tick(28 * MIN);
    cy.contains('Tu sesión se cerrará').should('not.exist');
    cy.location('pathname').should('eq', '/tabs/home');
  });

  it('el aviso de cierre solo aparece una vez en Login', () => {
    cy.tick(31 * MIN);
    cy.location('pathname', { timeout: 10000 }).should('eq', '/login');
    cy.contains('Tu sesión se cerró por inactividad').should('be.visible');

    cy.reload();
    cy.contains('Tu sesión se cerró por inactividad').should('not.exist');
  });
});
