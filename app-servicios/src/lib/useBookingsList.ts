import { useCallback, useEffect, useState } from 'react';
import {
  hourglassOutline, checkmarkCircleOutline, constructOutline, banOutline,
} from 'ionicons/icons';
import { supabase } from './supabaseClient';
import { getFriendlyErrorMessage } from './errorMessages';
import { bookingRowSchema, parseRowsOrDrop, type BookingRow, type BookingStatus } from './supabaseSchemas';

export const STATUS_META: Record<BookingStatus, { label: string; icon: string }> = {
  solicitado: { label: 'Solicitado', icon: hourglassOutline },
  aceptado: { label: 'Aceptado', icon: checkmarkCircleOutline },
  en_curso: { label: 'En curso', icon: constructOutline },
  completado: { label: 'Completado', icon: checkmarkCircleOutline },
  cancelado: { label: 'Cancelado', icon: banOutline },
};

export interface BookingListItem extends BookingRow {
  otherPartyName: string | null;
}

type OwnField = 'client_id' | 'professional_id';

const otherFieldOf = (ownField: OwnField): OwnField => (ownField === 'client_id' ? 'professional_id' : 'client_id');

/**
 * Fetch + acciones compartidas entre ClientBookings y ProfessionalBookings -
 * ambas listas son la misma tabla vista desde el lado opuesto (client_id vs
 * professional_id), con el mismo patrón de fetch/realtime/withPending; lo
 * único que cambia entre las dos pantallas son los botones de acción, que
 * cada una arma con su propio JSX.
 */
export function useBookingsList(userId: string, ownField: OwnField) {
  const otherField = otherFieldOf(ownField);
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, scheduled_at, price_agreed, notes, created_at, client_id, professional_id, services ( title, price_unit )')
      .eq(ownField, userId)
      .order('created_at', { ascending: false });

    if (error) {
      setError(getFriendlyErrorMessage(error));
      setLoading(false);
      return;
    }

    const rows = parseRowsOrDrop(bookingRowSchema, data ?? [], `useBookingsList.${ownField}`);
    const otherIds = [...new Set(rows.map((r) => r[otherField]))];

    const { data: profilesData } = otherIds.length
      ? await supabase.from('profiles_public').select('id, full_name').in('id', otherIds)
      : { data: [] as { id: string; full_name: string }[] };

    const nameById = new Map((profilesData ?? []).map((p) => [p.id, p.full_name]));

    setBookings(rows.map((r) => ({ ...r, otherPartyName: nameById.get(r[otherField]) ?? null })));
    setLoading(false);
  }, [userId, ownField, otherField]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`bookings-${ownField}-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `${ownField}=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, ownField, load]);

  const withPending = async (id: string, fn: () => Promise<void>) => {
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const updateStatus = (id: string, status: BookingStatus) => withPending(id, async () => {
    const { data, error } = await supabase.from('bookings').update({ status }).eq('id', id).select('id');

    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }
    if (!data || data.length === 0) {
      setError('No se pudo actualizar la solicitud (no tenés permiso o ya no existe).');
      return;
    }
    setError('');
  });

  return { bookings, loading, error, pendingIds, updateStatus };
}
