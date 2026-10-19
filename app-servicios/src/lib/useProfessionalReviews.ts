import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from './supabaseClient';
import { getFriendlyErrorMessage } from './errorMessages';
import { parseRowsOrDrop } from './supabaseSchemas';

const PAGE_SIZE = 10;

const professionalReviewSchema = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  reviewer_name: z.string(),
  service_title: z.string().nullable(),
  is_mine: z.boolean(),
});

export type ProfessionalReview = z.infer<typeof professionalReviewSchema>;

/**
 * Reseñas que recibió un profesional, de la más nueva a la más vieja y paginadas de a PAGE_SIZE (cursor por fecha + id).
 * Sale de la función professional_reviews (sql_docker/feature-professional-reviews.sql), que devuelve el nombre
 * del autor abreviado y no expone ids de personas: la tabla reviews ya no es legible para terceros.
 */
export function useProfessionalReviews(professionalId: string | undefined) {
  const [reviews, setReviews] = useState<ProfessionalReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  // Profesional vigente: si se navega a otro mientras llega una respuesta, la vieja se descarta.
  const currentId = useRef(professionalId);
  currentId.current = professionalId;

  const fetchPage = useCallback(async (cursor: { createdAt: string; id: string } | null) => {
    const { data, error: rpcError } = await supabase.rpc('professional_reviews', {
      p_professional_id: professionalId,
      p_limit: PAGE_SIZE,
      p_before: cursor?.createdAt ?? null,
      p_before_id: cursor?.id ?? null,
    });
    if (rpcError) throw rpcError;
    return parseRowsOrDrop(professionalReviewSchema, data ?? [], 'useProfessionalReviews.page');
  }, [professionalId]);

  useEffect(() => {
    setReviews([]);
    setHasMore(false);
    setError('');
    if (!professionalId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    fetchPage(null)
      .then((page) => {
        if (cancelled || currentId.current !== professionalId) return;
        setReviews(page);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (!cancelled) setError(getFriendlyErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [professionalId, fetchPage]);

  const loadMore = useCallback(async () => {
    const last = reviews[reviews.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage({ createdAt: last.created_at, id: last.id });
      if (currentId.current !== professionalId) return;
      // Por si una reseña nueva desplazó la paginación: no se repiten ids ya mostrados.
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !seen.has(r.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [reviews, loadingMore, fetchPage, professionalId]);

  return { reviews, loading, loadingMore, hasMore, error, loadMore };
}
