import { APK_RELEASE } from '../../src/lib/appRelease';

// Landing publica en `/` (web). En la app nativa `/` va directo a login, pero eso solo se prueba en el APK.
describe('Landing', () => {
  describe('sin sesión', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('muestra el hero y los oficios que vienen de la base', () => {
      cy.contains('h1', 'El profesional que necesitás').should('be.visible');
      // Se leen de `categories` sin sesion (policy categories_select_public): el stack local trae estos
      // 5 oficios sembrados, que son los mismos que hay en OCI.
      for (const oficio of ['Albañilería', 'Carpintería', 'Electricista', 'Pintura', 'Plomería']) {
        cy.contains('.landing-chip', oficio).should('exist');
      }
    });

    it('la descarga del APK depende de que haya una versión publicada con su SHA-256', () => {
      // La landing solo ofrece el APK con version Y sha256 (no se publica un binario sin checksum).
      if (APK_RELEASE.version !== null && APK_RELEASE.sha256 !== null) {
        cy.get('a[href$="yaquedo.apk"]').should('exist');
        cy.contains('#descargar', APK_RELEASE.sha256).should('exist');
      } else {
        cy.contains('#descargar', 'Descarga disponible pronto').should('exist');
        cy.get('a[href$="yaquedo.apk"]').should('not.exist');
      }
    });

    it('"Usar en la web" lleva al login', () => {
      // scrollBehavior 'center': el auto-scroll por defecto ('top') deja el boton bajo la barra sticky.
      cy.contains('a.landing-btn', 'Usar en la web').click({ scrollBehavior: 'center' });
      cy.location('pathname').should('eq', '/login');
    });

    it('"Crear mi perfil profesional" abre el alta ya posicionada como profesional', () => {
      cy.contains('a.landing-btn', 'Crear mi perfil profesional').click({ scrollBehavior: 'center' });
      cy.location('pathname').should('eq', '/login');
      cy.location('search').should('eq', '?modo=registro&rol=profesional');
      // Modo registro (boton "Registrarme") y rol preseleccionado. `value` de ion-select es una propiedad
      // que React fija, no un atributo HTML.
      cy.contains('ion-button', 'Registrarme').should('exist');
      cy.get('ion-select').first().should(($el) => {
        expect(($el[0] as unknown as { value: string }).value).to.eq('profesional');
      });
    });

    it('/login sin parámetros sigue abriendo el inicio de sesión', () => {
      cy.visit('/login');
      cy.contains('ion-button', 'Entrar').should('exist');
      cy.contains('ion-button', 'Registrarme').should('not.exist');
    });

    it('si Login ya estaba abierto, el enlace de la landing igual abre el alta como profesional', () => {
      // Regresion: Ionic mantiene Login montado en su pila; los useState iniciales no se reinician, asi que
      // volver a la landing y pulsar "Crear mi perfil profesional" mostraba el login de cliente.
      cy.contains('a.landing-btn', 'Ingresar').click();
      cy.location('pathname').should('eq', '/login');
      cy.contains('ion-button', 'Entrar').should('exist');

      cy.go('back');
      cy.location('pathname').should('eq', '/');
      cy.contains('a.landing-btn', 'Crear mi perfil profesional').click({ scrollBehavior: 'center' });

      cy.location('search').should('eq', '?modo=registro&rol=profesional');
      cy.contains('ion-button', 'Registrarme').should('exist');
      cy.get('ion-select').first().should(($el) => {
        expect(($el[0] as unknown as { value: string }).value).to.eq('profesional');
      });
    });

    it('los enlaces de la barra dejan el título de la sección visible, no tapado por la barra sticky', () => {
      for (const [texto, id] of [['Cómo funciona', 'como-funciona'], ['Profesionales', 'profesionales'], ['Android', 'descargar']]) {
        cy.contains('.landing-nav__links a', texto).click();
        cy.wait(700); // scroll suave
        cy.window().then((win) => {
          const nav = win.document.querySelector('.landing-nav')!.getBoundingClientRect();
          const section = win.document.getElementById(id)!.getBoundingClientRect();
          expect(section.top, `la sección #${id} no debe quedar bajo la barra`).to.be.at.least(nav.bottom - 1);
        });
      }
    });
  });

  describe('con sesión', () => {
    const password = 'Test1234';
    const email = `e2e-landing-${Date.now()}@test.local`;

    before(() => {
      cy.apiSignup(email, password, 'Usuario Landing', 'cliente');
    });

    it('en "/" ve la landing y todos sus accesos llevan al feed, no al login', () => {
      cy.login(email, password);
      cy.visit('/');
      cy.location('pathname').should('eq', '/');
      // Cabecera, boton del hero y pie de pagina usan el mismo destino y el mismo texto.
      cy.get('a.landing-btn').filter(':contains("Usar en la web")').should('not.exist');
      cy.contains('a.landing-btn', 'Ir a mi cuenta').click({ scrollBehavior: 'center' });
      cy.location('pathname').should('eq', '/tabs/home');
    });
  });
});
