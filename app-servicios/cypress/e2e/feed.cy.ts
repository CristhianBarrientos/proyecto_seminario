// El feed hace scroll DENTRO de ion-content (contenedor interno de Ionic), no en la pagina:
// cy.scrollIntoView() mueve la pagina externa y deja la tarjeta fuera de pantalla. Ademas
// ion-content es `fullscreen`: su scroll interno empieza detras del header sticky (titulo +
// buscador + filtro) y el contenido pasa por debajo de el. Se scrollea el elemento real que expone
// Ionic (ion-content.getScrollElement()) hasta dejar la tarjeta justo debajo del header, medido con
// la altura real del header (no un valor fijo). Sin { force: true }: los checks de visibilidad y de
// cobertura de Cypress siguen validando que un usuario puede ver y tocar la tarjeta.
const scrollToCard = (name: string) => {
  cy.get('ion-header:visible').first().then(($header) => {
    cy.get('ion-content:visible').first().then(($content) => {
      const content = $content[0] as unknown as { getScrollElement(): Promise<HTMLElement> };
      cy.wrap(content.getScrollElement()).then(($scroll) => {
        // La tarjeta se mide aca adentro, justo antes de scrollear, no antes: si el feed se
        // re-renderiza entre medio, el elemento y los offsets capturados quedarian obsoletos.
        cy.contains('.service-card', name).then(($card) => {
          const headerBottom = $header[0].getBoundingClientRect().bottom;
          $scroll[0].scrollTop += $card[0].getBoundingClientRect().top - (headerBottom + 8);
        });
      });
    });
  });
  return cy.contains('.service-card', name);
};

describe('Feed de servicios', () => {
  const password = 'Test1234';
  const email = `e2e-feed-${Date.now()}@test.local`;

  before(() => {
    cy.apiSignup(email, password, 'Usuario Prueba', 'cliente');
  });

  beforeEach(() => {
    cy.login(email, password);
  });

  it('lista los profesionales demo con nombre, categoría y precio', () => {
    // Datos demo del stack local (schema-inicial.sql / seed): 10 profesionales
    // con servicios activos, entre ellos "Carlos Méndez" (Electricista).
    scrollToCard('Carlos Méndez').should('be.visible').and('contain', 'Electricista');
    cy.get('.service-card').should('have.length.greaterThan', 1);
  });

  it('filtra el feed al buscar por nombre', () => {
    cy.get('ion-searchbar input').type('Carlos');

    cy.get('.service-card').should('have.length', 1);
    cy.contains('.service-card', 'Carlos Méndez').should('be.visible');
  });

  it('muestra el detalle del profesional al hacer click en su tarjeta', () => {
    // scrollBehavior: false - la tarjeta ya quedó posicionada en el scroll interno de ion-content;
    // el auto-scroll de click() mueve la página externa y la deja bajo el buscador. Los chequeos de
    // visibilidad y de cobertura de click() siguen activos (no es force: true).
    scrollToCard('Carlos Méndez').click({ scrollBehavior: false });

    cy.location('pathname').should('include', '/tabs/home/');
    cy.contains('Perfil del profesional').should('be.visible');
    cy.contains('Carlos Méndez').should('be.visible');
  });
});
