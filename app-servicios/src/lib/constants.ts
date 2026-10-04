/**
 * price_unit en la tabla `services` es `text` libre (sin CHECK constraint,
 * ver sql_docker/schema-inicial.sql:75) - esta lista es la única fuente de
 * verdad del lado del frontend para qué valores son válidos, en vez de tener
 * los mismos 4 strings repetidos sueltos en cada lugar que arma el dropdown.
 */
export const PRICE_UNITS = [
  { value: 'servicio', label: 'Por servicio' },
  { value: 'hora', label: 'Por hora' },
  { value: 'dia', label: 'Por día' },
  { value: 'm2', label: 'Por m²' },
] as const;

export type PriceUnit = (typeof PRICE_UNITS)[number]['value'];

export const DEFAULT_PRICE_UNIT: PriceUnit = 'servicio';

/**
 * Motivos de denuncia. Los valores deben coincidir con el CHECK de
 * public.reports.reason (sql_docker/feature-reports.sql).
 */
export const REPORT_REASONS = [
  { value: 'fraude', label: 'Fraude o estafa' },
  { value: 'acoso', label: 'Acoso o trato abusivo' },
  { value: 'servicio_no_prestado', label: 'Servicio no prestado / no se presentó' },
  { value: 'contenido_inapropiado', label: 'Contenido inapropiado' },
  { value: 'suplantacion', label: 'Suplantación de identidad' },
  { value: 'otro', label: 'Otro' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export const REPORT_DETAILS_MAX_LENGTH = 1000;
