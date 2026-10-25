// Reseñas de clientes a profesionales (sql_docker/feature-professional-reviews.sql): calificar un trabajo completado,
// verlo en el perfil público, editarlo, eliminarlo, y ver la reputación propia. Corre contra el stack local.
//
// El trabajo completado se prepara por API (sin UI) con la misma secuencia que usa el resto de la app: el
// profesional crea su perfil y un servicio, el cliente pide el servicio y el profesional lo lleva a "completado".
//
// Cada caso es independiente: el primero parte de "sin reseña" (la borra si quedó una de una corrida anterior) y
// los demás la crean ellos mismos con una inserción idempotente, así que se pueden correr solos (--spec, it.only).

const password = 'Test1234!';
const stamp = Date.now();
const clientEmail = `e2e-reviews-client-${stamp}@test.local`;
const proEmail = `e2e-reviews-pro-${stamp}@test.local`;

interface Session {
  token: string;
  id: string;
}

describe('Reseñas', () => {
  let client: Session;
  let pro: Session;
  let bookingId: string;

  const url = (path: string) => `${Cypress.env('supabaseUrl')}${path}`;

  const rest = (method: 'POST' | 'PATCH' | 'DELETE', path: string, token: string, body?: object, prefer = 'return=representation') =>
    cy.request({
      method,
      url: url(path),
      headers: { apikey: Cypress.env('supabaseAnonKey'), Authorization: `Bearer ${token}`, Prefer: prefer },
      body,
    });

  const signIn = (email: string) =>
    cy
      .request({
        method: 'POST',
        url: url('/auth/v1/token?grant_type=password'),
        headers: { apikey: Cypress.env('supabaseAnonKey') },
        body: { email, password },
      })
      .then((r): Session => ({ token: r.body.access_token, id: r.body.user.id }));

  /** Reseña publicada por API. Idempotente: si ya existe (una por trabajo), no falla ni duplica. */
  const ensureReview = (rating: number, comment: string) =>
    rest(
      'POST',
      '/rest/v1/reviews?on_conflict=booking_id',
      client.token,
      { booking_id: bookingId, client_id: client.id, professional_id: pro.id, rating, comment },
      'resolution=ignore-duplicates,return=minimal',
    ).its('status').should('be.oneOf', [200, 201]);

  const deleteReview = () =>
    rest('DELETE', `/rest/v1/reviews?booking_id=eq.${bookingId}`, client.token, undefined, 'return=minimal')
      .its('status').should('be.oneOf', [200, 204]);

  before(() => {
    cy.apiSignup(clientEmail, password, 'Lucía Prueba Reseñas', 'cliente');
    cy.apiSignup(proEmail, password, 'Pedro Plomero Prueba', 'profesional');

    signIn(clientEmail).then((s) => { client = s; });
    signIn(proEmail).then((s) => { pro = s; });

    cy.then(() => rest('POST', '/rest/v1/professional_profiles', pro.token, { profile_id: pro.id, bio: 'Plomero de prueba para e2e' }, 'resolution=merge-duplicates,return=minimal')
      .its('status').should('eq', 201));
    cy.then(() =>
      rest('POST', '/rest/v1/services', pro.token, {
        professional_id: pro.id, category_id: 2, title: 'Reparación de tubería', price: 150, price_unit: 'servicio',
      }).then((r) =>
        rest('POST', '/rest/v1/bookings', client.token, {
          client_id: client.id, professional_id: pro.id, service_id: r.body[0].id, notes: 'e2e reseñas',
        }),
      ).then((r) => { bookingId = r.body[0].id; }),
    );

    // Cada cambio de estado se verifica: si el trigger de la máquina de estados rechazara alguno, el fallo
    // aparece acá y no como un "no encuentro el botón" mucho después.
    for (const status of ['aceptado', 'en_curso', 'completado']) {
      cy.then(() =>
        rest('PATCH', `/rest/v1/bookings?id=eq.${bookingId}`, pro.token, { status }, 'return=minimal')
          .its('status').should('eq', 204),
      );
    }
  });

  it('el cliente califica un trabajo completado, lo ve en el perfil, lo edita y lo elimina', () => {
    deleteReview(); // parte de "sin reseña" aunque haya quedado una de otra corrida

    cy.login(clientEmail, password);
    cy.visit('/tabs/bookings');

    // Publicar: con 4 estrellas y un comentario.
    cy.contains('ion-button', 'Calificar profesional').click({ scrollBehavior: 'center' });
    cy.contains('Tu reseña es pública').should('be.visible');
    cy.get('button[aria-label="4 estrellas"]').click();
    cy.get('ion-textarea textarea').type('Muy buen trabajo, llegó a tiempo.');
    cy.contains('ion-button', 'Publicar reseña').click();
    cy.get('.review-box').should('contain.text', 'Tu reseña').and('contain.text', 'Muy buen trabajo, llegó a tiempo.');
    cy.get('.review-box').should('not.contain.text', '(editada)');

    // Se ve en el perfil público del profesional, con el autor abreviado, y entra al promedio.
    cy.visit(`/tabs/home/${pro.id}`);
    cy.get('.app-chip--rating').should('contain.text', '4').and('contain.text', '(1)');
    cy.contains('.review-item', 'Lucía R.').should('contain.text', 'Muy buen trabajo, llegó a tiempo.').and('contain.text', 'Tu reseña');
    cy.get('.review-item').should('not.contain.text', 'Prueba Reseñas');

    // Editar: queda marcada como editada.
    cy.visit('/tabs/bookings');
    cy.contains('ion-button', 'Editar').click({ scrollBehavior: 'center' });
    cy.get('button[aria-label="5 estrellas"]').click();
    cy.contains('ion-button', 'Guardar cambios').click();
    cy.get('.review-box').should('contain.text', '(editada)');

    // Eliminar: pide confirmación y la reseña desaparece del perfil.
    cy.contains('ion-button', 'Eliminar').click();
    cy.contains('¿Eliminar tu reseña?').should('be.visible');
    cy.contains('ion-button', 'Conservarla').click();
    cy.get('.review-box').should('contain.text', 'Tu reseña');
    cy.contains('ion-button', 'Eliminar').click();
    cy.contains('ion-button', 'Sí, eliminar').click();
    cy.contains('ion-button', 'Calificar profesional').should('exist');

    cy.visit(`/tabs/home/${pro.id}`);
    cy.contains('Todavía no tiene reseñas').should('be.visible');
  });

  describe('con una reseña ya publicada', () => {
    beforeEach(() => {
      ensureReview(5, 'Excelente');
    });

    it('un tercero no puede leer la tabla reviews, pero sí el promedio; la función exige sesión', () => {
      const anon = { apikey: Cypress.env('supabaseAnonKey'), Authorization: `Bearer ${Cypress.env('supabaseAnonKey')}` };

      // Anónimo: la tabla está cerrada (lista vacía) y la función le es denegada; el promedio es público.
      cy.request({ url: url('/rest/v1/reviews?select=id'), headers: anon }).its('body').should('have.length', 0);
      cy.request({
        method: 'POST', url: url('/rest/v1/rpc/professional_reviews'), headers: anon,
        body: { p_professional_id: pro.id }, failOnStatusCode: false,
      }).its('status').should('be.oneOf', [401, 403]);
      cy.request({ url: url(`/rest/v1/professional_ratings?professional_id=eq.${pro.id}&select=rating_avg,rating_count`), headers: anon })
        .its('body.0').should('deep.include', { rating_count: 1 });

      // Un cliente con sesión sí lee la lista por la función, con el autor abreviado y sin ids de personas.
      cy.request({
        method: 'POST', url: url('/rest/v1/rpc/professional_reviews'),
        headers: { apikey: Cypress.env('supabaseAnonKey'), Authorization: `Bearer ${pro.token}` },
        body: { p_professional_id: pro.id, p_limit: 5 },
      }).its('body.0').should((r) => {
        expect(r.reviewer_name).to.eq('Lucía R.');
        expect(r).to.not.have.property('client_id');
        expect(r).to.not.have.property('booking_id');
      });

      // Un comentario de más de 500 caracteres se rechaza.
      cy.request({
        method: 'PATCH',
        url: url(`/rest/v1/reviews?booking_id=eq.${bookingId}`),
        headers: { apikey: Cypress.env('supabaseAnonKey'), Authorization: `Bearer ${client.token}` },
        body: { comment: 'x'.repeat(501) }, failOnStatusCode: false,
      }).its('status').should('eq', 400);
    });

    it('el profesional ve su reputación y las reseñas que recibió en "Perfil"', () => {
      cy.login(proEmail, password);
      cy.visit('/tabs/profile');
      cy.contains('Mi reputación').should('be.visible');
      cy.get('.reputation-card').should('contain.text', '5.0').and('contain.text', '1 reseña');
      cy.contains('.review-item', 'Lucía R.').should('contain.text', 'Excelente');
    });
  });

  it('el cliente ve "Mi reputación" aunque ningún profesional lo haya calificado todavía', () => {
    cy.login(clientEmail, password);
    cy.visit('/tabs/profile');
    cy.contains('Mi reputación').should('be.visible');
    cy.get('.reputation-card').should('contain.text', 'Todavía no te calificó ningún profesional');
    cy.get('.review-item').should('not.exist');
  });
});
