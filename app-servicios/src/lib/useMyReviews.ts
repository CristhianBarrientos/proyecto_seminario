import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from './supabaseClient';
import { getFriendlyErrorMessage } from './errorMessages';
import { parseRowsOrDrop } from './supabaseSchemas';
import type { BookingListItem } from './useBookingsList';

/** Largo máximo del comentario. Debe coincidir con el check reviews_comment_len de sql_docker/feature-professional-reviews.sql. */
export const MAX_REVIEW_COMMENT = 500;

const myReviewRowSchema = z.object({
  id: z.string(),
  booking_id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  /** true si ya se modificó después de publicarla (se muestra "editada"). */
  edited: boolean;
}

/**
 * Reseñas que el CLIENTE dejó a los profesionales (tabla reviews, ver sql_docker/feature-professional-reviews.sql).
 * Es el espejo de useClientReviews (que es profesional -> cliente). Carga las propias por reserva para saber
 * a cuáles ofrecer "Calificar", y expone crear / editar / eliminar. Cada acción devuelve null si se concretó o el
 * mensaje de error para mostrarlo junto al formulario.
 */
export function useMyReviews(clientId: string, bookings: BookingListItem[]) {
  const [reviewByBooking, setReviewByBooking] = useState<Map<string, MyReview>>(new Map());
  const [error, setError] = useState('');
  // false hasta que termina la primera carga: sin esto "Calificar" aparece un instante en reservas ya reseñadas.
  const [loaded, setLoaded] = useState(false);
  // Número de request vigente: una respuesta vieja no debe pisar el estado de una más nueva.
  const requestId = useRef(0);

  // Solo cuentan las reservas completadas: es lo único que se puede reseñar. Se recarga si cambia el conjunto.
  const completedKey = useMemo(
    () => bookings.filter((b) => b.status === 'completado').map((b) => b.id).sort().join(','),
    [bookings],
  );

  const load = useCallback(async () => {
    const myRequest = ++requestId.current;
    if (!completedKey) {
      setReviewByBooking(new Map());
      setLoaded(true);
      return;
    }

    const { data, error: loadError } = await supabase
      .from('reviews')
      .select('id, booking_id, rating, comment, updated_at')
      .eq('client_id', clientId)
      .in('booking_id', completedKey.split(','));

    if (myRequest !== requestId.current) return;
    if (loadError) {
      setError(getFriendlyErrorMessage(loadError));
      // Aun con error se marca como cargado: si no, "Calificar profesional" desaparece hasta recargar la pagina. Si ya
      // habia una reseña, la base rechaza el duplicado (una por trabajo) y el formulario muestra el motivo.
      setLoaded(true);
      return;
    }

    const rows = parseRowsOrDrop(myReviewRowSchema, data ?? [], 'useMyReviews.load');
    setReviewByBooking(new Map(rows.map((r) => [
      r.booking_id,
      { id: r.id, rating: r.rating, comment: r.comment, edited: r.updated_at !== null },
    ])));
    setError('');
    setLoaded(true);
  }, [clientId, completedKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Devuelve null si salio bien o el mensaje para el usuario si no: el formulario lo muestra junto a sus botones
  // (antes quedaba arriba de la lista, lejos de donde se toco "Publicar").
  const run = async (action: () => PromiseLike<{ error: unknown }>): Promise<string | null> => {
    const { error: actionError } = await action();
    if (actionError) return getFriendlyErrorMessage(actionError);
    setError('');
    await load();
    return null;
  };

  const submitReview = (booking: BookingListItem, rating: number, comment: string) =>
    run(() => supabase.from('reviews').insert({
      booking_id: booking.id,
      client_id: clientId,
      professional_id: booking.professional_id,
      rating,
      comment: comment.trim() || null,
    }));

  const updateReview = (review: MyReview, rating: number, comment: string) =>
    run(() => supabase.from('reviews').update({ rating, comment: comment.trim() || null }).eq('id', review.id));

  const deleteReview = (review: MyReview) =>
    run(() => supabase.from('reviews').delete().eq('id', review.id));

  return { reviewByBooking, loaded, error, submitReview, updateReview, deleteReview };
}
