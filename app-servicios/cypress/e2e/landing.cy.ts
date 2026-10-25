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

    it('"Otros" cierra la lista de oficios: hay mas de los que estan cargados', () => {
      cy.get('.landing-chips .landing-chip').last().should('have.text', 'Otros');
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
      // Modo registro (paso 1 de 3) y rol preseleccionado (la tarjeta del rol queda con aria-checked).
      cy.contains('Paso 1 de 3').should('exist');
      cy.get('.role-card[aria-checked="true"]').should('contain.text', 'Profesional');
    });

    it('/login sin parámetros sigue abriendo el inicio de sesión', () => {
      cy.visit('/login');
      cy.contains('ion-button', 'Entrar').should('exist');
      cy.contains('Paso 1 de 3').should('not.exist');
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
      cy.contains('Paso 1 de 3').should('exist');
      cy.get('.role-card[aria-checked="true"]').should('contain.text', 'Profesional');
    });

    it('si el usuario cambió el formulario a mano, el mismo enlace de la landing lo vuelve a dejar en el alta', () => {
      // Los parametros de la URL quedan identicos entre la primera y la segunda vez, asi que no basta con
      // reaccionar a un cambio de URL: hay que reiniciar el formulario cada vez que Login vuelve a ser activo.
      cy.contains('a.landing-btn', 'Crear mi perfil profesional').click({ scrollBehavior: 'center' });
      cy.contains('Paso 1 de 3').should('exist');
      cy.contains('ion-segment-button', 'Iniciar sesión').click(); // pasa a login a mano; la URL no cambia
      cy.contains('ion-button', 'Entrar').should('exist');

      cy.go('back');
      cy.location('pathname').should('eq', '/');
      cy.contains('a.landing-btn', 'Crear mi perfil profesional').click({ scrollBehavior: 'center' });
      cy.contains('Paso 1 de 3').should('exist');
      cy.get('.role-card[aria-checked="true"]').should('contain.text', 'Profesional');
    });

    it('los enlaces de la barra dejan el título de la sección visible, no tapado por la barra sticky', () => {
      for (const [texto, id] of [['Cómo funciona', 'como-funciona'], ['Profesionales', 'profesionales'], ['Preguntas', 'preguntas'], ['Android', 'descargar']]) {
        cy.contains('.landing-nav__links a', texto).click();
        // `should` con callback reintenta hasta que termina el scroll suave (sin esperas fijas). Nav y
        // seccion se miden respecto del mismo viewport, asi que la comparacion es valida aunque el scroll
        // ocurra dentro de ion-content.
        cy.window().should((win) => {
          const nav = win.document.querySelector('.landing-nav')!.getBoundingClientRect();
          const section = win.document.getElementById(id)!.getBoundingClientRect();
          expect(section.top, `la sección #${id} no debe quedar bajo la barra`).to.be.at.least(nav.bottom - 1);
        });
      }
    });
  });

  describe('preguntas frecuentes y pie legal', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('las preguntas se abren y se cierran con su respuesta', () => {
      cy.get('.landing-faq__item').should('have.length', 8);
      cy.contains('.landing-faq__item summary', 'Verificado').click({ scrollBehavior: 'center' });
      cy.contains('.landing-faq__item[open]', 'proceso de verificación autorizado').should('exist');
      cy.contains('.landing-faq__item summary', 'Verificado').click();
      cy.get('.landing-faq__item[open]').should('not.exist');
    });

    it('"Cómo instalo la app" abre una ventana con el paso a paso y se cierra', () => {
      cy.contains('.landing-faq__item summary', 'Cómo instalo la app').click({ scrollBehavior: 'center' });
      cy.contains('.landing-faq__item[open] button', 'Ver paso a paso').click();
      cy.get('ion-modal.landing-install-modal').should('be.visible');
      cy.contains('ion-modal .landing-install-guide h3', 'Permití la instalación').should('be.visible');
      cy.contains('ion-modal ion-button', 'Cerrar').click();
      cy.get('ion-modal.landing-install-modal').should('not.exist');
    });

    it('"Cómo me hago profesional" lleva al alta ya posicionada como profesional', () => {
      cy.contains('.landing-faq__item summary', 'Cómo me hago profesional').click({ scrollBehavior: 'center' });
      cy.contains('.landing-faq__item[open] a', 'Registrarme como profesional').click();
      cy.location('pathname').should('eq', '/login');
      cy.location('search').should('eq', '?modo=registro&rol=profesional');
    });

    it('el pie lleva al aviso de privacidad y a los términos, sin pedir sesión', () => {
      cy.contains('.landing-footer__links a', 'Privacidad').click({ scrollBehavior: 'center' });
      cy.location('pathname').should('eq', '/privacidad');
      cy.contains('h1', 'Aviso de privacidad').should('be.visible');

      cy.contains('.legal-footer a', 'Términos de uso').click({ scrollBehavior: 'center' });
      cy.location('pathname').should('eq', '/terminos');
      cy.contains('h1', 'Términos de uso').should('be.visible');

      cy.contains('a', 'Volver al inicio').click();
      cy.location('pathname').should('eq', '/');
    });
  });

  describe('con sesión', () => {
    const password = 'Test1234!';
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
