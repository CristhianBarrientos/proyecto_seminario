/**
 * Topes de longitud de los textos que escribe la persona. Deben coincidir con los CHECK de la base
 * (sql_docker/fix-search-path-y-limites.sql): si cambian aqui, cambian alla. El front los aplica con
 * `maxlength` para que nadie llegue a un error de base de datos por escribir de mas.
 *
 * Solo estan los campos que existen en la UI. phone (<= 20), avatar_url (<= 2048) y
 * services.description (<= 1000) tienen CHECK en la base pero hoy no tienen campo: si se agrega uno,
 * agregar aqui su constante y aplicarla con `maxlength`.
 */
export const MAX_FULL_NAME = 100; // profiles.full_name
export const MAX_BOOKING_NOTES = 500; // bookings.notes
export const MAX_PROFESSIONAL_BIO = 1000; // professional_profiles.bio
export const MAX_SERVICE_TITLE = 100; // services.title
