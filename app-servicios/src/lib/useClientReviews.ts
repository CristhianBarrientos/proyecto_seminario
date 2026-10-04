import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from './supabaseClient';
import { getFriendlyErrorMessage } from './errorMessages';
import { parseRowsOrDrop } from './supabaseSchemas';
import type { BookingListItem } from './useBookingsList';

const clientReviewRowSchema = z.object({ booking_id: z.string(), rating: z.number() });
const clientRatingRowSchema = z.object({ client_id: z.string(), rating_avg: z.number(), rating_count: z.number() });

export interface ClientRating {
  avg: number;
  count: number;
}

/**
 * Calificación profesional -> cliente (tabla client_reviews, ver
 * sql_docker/feature-client-reviews.sql). Carga, para las reservas del profesional:
 *  - qué reservas ya calificó (reviewedByBooking), para no ofrecer el formulario dos veces;
 *  - el promedio de cada cliente (ratingByClient), para mostrarlo en la tarjeta.
 */
export function useClientReviews(professionalId: string, bookings: BookingListItem[]) {
  const [reviewedByBooking, setReviewedByBooking] = useState<Map<string, number>>(new Map());
  const [ratingByClient, setRatingByClient] = useState<Map<string, ClientRating>>(new Map());
  const [error, setError] = useState('');
  // false hasta que termina la primera carga: sin esto el formulario "Calificar cliente" aparece
  // un instante en reservas ya calificadas (existingRating todavía undefined).
  const [loaded, setLoaded] = useState(false);
  // Número de request vigente: una respuesta vieja no debe pisar el estado de una más nueva.
  const requestId = useRef(0);

  const clientIdsKey = useMemo(
    () => [...new Set(bookings.map((b) => b.client_id))].sort().join(','),
    [bookings],
  );

  const load = useCallback(async () => {
    const myRequest = ++requestId.current;
    const clientIds = clientIdsKey ? clientIdsKey.split(',') : [];
    if (clientIds.length === 0) {
      setReviewedByBooking(new Map());
      setRatingByClient(new Map());
      setLoaded(true);
      return;
    }

    const [reviewsResult, ratingsResult] = await Promise.all([
      supabase.from('client_reviews').select('booking_id, rating').eq('professional_id', professionalId),
      supabase.from('client_ratings').select('client_id, rating_avg, rating_count').in('client_id', clientIds),
    ]);

    if (myRequest !== requestId.current) return;

    if (reviewsResult.error || ratingsResult.error) {
      setError(getFriendlyErrorMessage(reviewsResult.error ?? ratingsResult.error));
      return;
    }

    const reviews = parseRowsOrDrop(clientReviewRowSchema, reviewsResult.data ?? [], 'useClientReviews.reviews');
    const ratings = parseRowsOrDrop(clientRatingRowSchema, ratingsResult.data ?? [], 'useClientReviews.ratings');
    setReviewedByBooking(new Map(reviews.map((r) => [r.booking_id, r.rating])));
    setRatingByClient(new Map(ratings.map((r) => [r.client_id, { avg: r.rating_avg, count: r.rating_count }])));
    setError('');
    setLoaded(true);
  }, [professionalId, clientIdsKey]);

  useEffect(() => {
    load();
  }, [load]);

  /** Devuelve true si se guardó, para que el formulario sepa si cerrarse. */
  const submitReview = async (booking: BookingListItem, rating: number, comment: string): Promise<boolean> => {
    const { error: insertError } = await supabase.from('client_reviews').insert({
      booking_id: booking.id,
      professional_id: professionalId,
      client_id: booking.client_id,
      rating,
      comment: comment.trim() || null,
    });

    if (insertError) {
      setError(getFriendlyErrorMessage(insertError));
      return false;
    }
    setError('');
    await load();
    return true;
  };

  return { reviewedByBooking, ratingByClient, loaded, error, submitReview };
}
