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

/**
 * Valida un array de filas crudas de Supabase contra `schema`. Si una fila
 * no matchea, se descarta y se loguea en consola (no se rompe el feed
 * completo por una fila inesperada) - devuelve solo las filas válidas.
 */
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

export const bookingRowListSchema = z.array(bookingRowSchema);
export type BookingRow = z.infer<typeof bookingRowSchema>;
export type BookingStatus = BookingRow['status'];

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
