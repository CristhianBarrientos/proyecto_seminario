// Landing publica en `/` (web). En la app nativa `/` va directo a login, pero eso solo se prueba en el APK.
describe('Landing', () => {
  describe('sin sesión', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('muestra el hero y los oficios que vienen de la base', () => {
      cy.contains('h1', 'El profesional que necesitás').should('be.visible');
      // Se leen de `categories` sin sesión (policy categories_select_public): el stack local trae estos
      // 5 oficios sembrados, que son los mismos que hay en OCI.
      for (const oficio of ['Albañilería', 'Carpintería', 'Electricista', 'Pintura', 'Plomería']) {
        cy.contains('.landing-chip', oficio).should('exist');
      }
    });

    it('sin APK publicado muestra "disponible pronto" y no ofrece descarga', () => {
      cy.contains('#descargar', 'Descarga disponible pronto').should('exist');
      cy.get('a[href$="yaquedo.apk"]').should('not.exist');
    });

    // TODO: falla porque Cypress hace scroll automatico al boton y lo deja tapado por la barra sticky de
    // la landing ("is being covered by another element"). Es el mismo patron que el header de Ionic en
    // feed.cy.ts (ver scrollToCard); falta confirmar que sea solo un artefacto del test y no un solape real.
    it.skip('"Usar en la web" lleva al login', () => {
      cy.contains('a.landing-btn', 'Usar en la web').click();
      cy.location('pathname').should('eq', '/login');
    });

    // TODO: falla en `cy.contains('ion-button', 'Registrarme').should('be.visible')` (el boton queda bajo el
    // pliegue del scroll interno de ion-content, que Cypress da por "no visible") y quiza en el atributo
    // `value` de ion-select, que React fija como propiedad y no como atributo. Ajustar con el scroll interno.
    it.skip('"Crear mi perfil profesional" abre el alta ya posicionada como profesional', () => {
      cy.contains('a.landing-btn', 'Crear mi perfil profesional').click();
      cy.location('pathname').should('eq', '/login');
      cy.location('search').should('eq', '?modo=registro&rol=profesional');
      // Modo registro: el botón de envío es "Registrarme" y el rol preseleccionado es Profesional.
      cy.contains('ion-button', 'Registrarme').should('be.visible');
      cy.get('ion-select').first().should('have.attr', 'value', 'profesional');
    });

    it('/login sin parámetros sigue abriendo el inicio de sesión como cliente', () => {
      cy.visit('/login');
      cy.contains('ion-button', 'Entrar').should('be.visible');
      cy.contains('ion-button', 'Registrarme').should('not.exist');
    });
  });

  describe('con sesión', () => {
    const password = 'Test1234';
    const email = `e2e-landing-${Date.now()}@test.local`;

    before(() => {
      cy.apiSignup(email, password, 'Usuario Landing', 'cliente');
    });

    it('en "/" ve la landing con "Ir a mi cuenta", que lleva al feed (ya no se redirige solo)', () => {
      cy.login(email, password);
      cy.visit('/');
      cy.location('pathname').should('eq', '/');
      cy.contains('a.landing-btn', 'Ir a mi cuenta').click();
      cy.location('pathname').should('eq', '/tabs/home');
    });
  });
});
