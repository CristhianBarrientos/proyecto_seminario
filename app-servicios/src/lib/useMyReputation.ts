import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from './supabaseClient';
import { getFriendlyErrorMessage } from './errorMessages';

// numeric y bigint pueden llegar como número o como texto según el cliente: se normaliza.
const ratingRowSchema = z.object({
  rating_avg: z.coerce.number(),
  rating_count: z.coerce.number(),
});

export interface Reputation {
  avg: number;
  count: number;
}

/**
 * Mi calificación promedio, según mi rol:
 *  - profesional: promedio de las reseñas que me dejaron los clientes (vista professional_ratings);
 *  - cliente: promedio con el que me califican los profesionales (vista client_ratings). La base solo se lo
 *    muestra a mí y a los profesionales con quienes tuve una solicitud, y no expone los comentarios.
 * `reputation` es null mientras carga y { avg: 0, count: 0 } si todavía no tengo calificaciones.
 */
export function useMyReputation(userId: string, role: 'cliente' | 'profesional') {
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setReputation(null);
    setError('');

    const query = role === 'profesional'
      ? supabase.from('professional_ratings').select('rating_avg, rating_count').eq('professional_id', userId)
      : supabase.from('client_ratings').select('rating_avg, rating_count').eq('client_id', userId);

    query.maybeSingle().then(({ data, error: queryError }) => {
      if (cancelled) return;
      if (queryError) {
        setError(getFriendlyErrorMessage(queryError));
        return;
      }
      const parsed = ratingRowSchema.safeParse(data);
      setReputation(parsed.success ? { avg: parsed.data.rating_avg, count: parsed.data.rating_count } : { avg: 0, count: 0 });
    });

    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  return { reputation, error };
}
