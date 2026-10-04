/**
 * Schemas de validación en runtime para filas devueltas por Supabase con
 * relaciones embebidas (ej. `categories ( name )`). supabase-js infiere esas
 * relaciones "a uno" como array a partir del string del select porque no ve
 * la FK real - en runtime siempre llega como objeto único o null, nunca
 * array, pero eso solo lo garantiza la DB, no el tipo. `as unknown as X`
 * confiaba en esa forma sin verificarla; estos schemas la validan antes de
 * usarla, así un cambio de shape en el backend rompe temprano y visible en
 * consola en vez de silenciosamente (ej. undefined.map en el render).
 */
import { z } from 'zod';

const categoryRefSchema = z.object({ name: z.string() }).nullable();

export const rawServiceRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  price_unit: z.string(),
  category_id: z.number(),
  professional_id: z.string(),
  categories: categoryRefSchema,
});

// Fila plana de la RPC feed_services() (sql_docker/perf-feed-services-rpc.sql): servicios activos
// ya unidos con categoría, nombre del profesional y verificación en un solo round-trip.
export const feedServiceRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  price_unit: z.string(),
  category_id: z.number(),
  category_name: z.string().nullable(),
  professional_id: z.string(),
  professional_name: z.string().nullable(),
  is_verified: z.boolean(),
});

export const rawServiceRowListSchema = z.array(rawServiceRowSchema);
export type RawServiceRow = z.infer<typeof rawServiceRowSchema>;

export const serviceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  price_unit: z.string(),
  categories: categoryRefSchema,
});

export const serviceItemListSchema = z.array(serviceItemSchema);
export type ServiceItem = z.infer<typeof serviceItemSchema>;

const bookingServiceRefSchema = z.object({ title: z.string(), price_unit: z.string() }).nullable();

export const bookingRowSchema = z.object({
  id: z.string(),
  status: z.enum(['solicitado', 'aceptado', 'en_curso', 'completado', 'cancelado']),
  scheduled_at: z.string().nullable(),
  price_agreed: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  client_id: z.string(),
  professional_id: z.string(),
  services: bookingServiceRefSchema,
});

// Fila plana de la RPC my_bookings(as_role) (sql_docker/perf-solicitudes-dashboard-rpc.sql):
// reserva + servicio + nombre de la contraparte en un solo round-trip.
export const myBookingRowSchema = z.object({
  id: z.string(),
  status: z.enum(['solicitado', 'aceptado', 'en_curso', 'completado', 'cancelado']),
  scheduled_at: z.string().nullable(),
  price_agreed: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  client_id: z.string(),
  professional_id: z.string(),
  service_title: z.string().nullable(),
  service_price_unit: z.string().nullable(),
  other_party_name: z.string().nullable(),
});

// Agregados de mercado para el dashboard del profesional (RPC dashboard_market_stats).
export const dashboardMarketStatsSchema = z.object({
  market_rating_avg: z.number().nullable(),
  price_by_category: z.array(z.object({ category_id: z.number(), avg_price: z.number() })),
});
export type DashboardMarketStats = z.infer<typeof dashboardMarketStatsSchema>;

export const bookingRowListSchema = z.array(bookingRowSchema);
export type BookingRow = z.infer<typeof bookingRowSchema>;
export type BookingStatus = BookingRow['status'];

/**
 * Valida un array de filas crudas de Supabase contra `schema`. Si una fila
 * no matchea, se descarta y se loguea en consola (no se rompe el feed
 * completo por una fila inesperada) - devuelve solo las filas válidas.
 */
export function parseRowsOrDrop<T>(schema: z.ZodType<T>, rows: unknown[], context: string): T[] {
  const result: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      result.push(parsed.data);
    } else {
      console.error(`[${context}] fila con shape inesperado, descartada`, row, parsed.error.issues);
    }
  }
  return result;
}
