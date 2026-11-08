/**
 * price_unit en `services` es `text` con un CHECK de lista cerrada
 * (services_price_unit_valid, sql_docker/fix-search-path-y-limites.sql). Esta lista es la única
 * fuente de verdad del lado del frontend; si se agrega una unidad aquí hay que agregarla también
 * al CHECK, o la base rechazará ese servicio.
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
