/**
 * Topes de longitud de los textos que escribe la persona. Deben coincidir con los CHECK de la base
 * (sql_docker/fix-search-path-y-limites.sql): si cambian aqui, cambian alla. El front los aplica con
 * `maxlength` para que nadie llegue a un error de base de datos por escribir de mas.
 */
export const MAX_FULL_NAME = 100; // profiles.full_name
export const MAX_BOOKING_NOTES = 500; // bookings.notes
export const MAX_PROFESSIONAL_BIO = 1000; // professional_profiles.bio
export const MAX_SERVICE_TITLE = 100; // services.title
export const MAX_SERVICE_DESCRIPTION = 1000; // services.description
export const MAX_PHONE = 20; // profiles.phone
