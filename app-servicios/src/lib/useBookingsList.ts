import { useCallback, useEffect, useState } from 'react';
import {
  hourglassOutline, checkmarkCircleOutline, constructOutline, banOutline,
} from 'ionicons/icons';
import { supabase } from './supabaseClient';
import { getFriendlyErrorMessage } from './errorMessages';
import { myBookingRowSchema, parseRowsOrDrop, type BookingRow, type BookingStatus } from './supabaseSchemas';

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

/**
 * Fetch + acciones compartidas entre ClientBookings y ProfessionalBookings -
 * ambas listas son la misma tabla vista desde el lado opuesto (client_id vs
 * professional_id), con el mismo patrón de fetch/realtime/withPending; lo
 * único que cambia entre las dos pantallas son los botones de acción, que
 * cada una arma con su propio JSX.
 */
export function useBookingsList(userId: string, ownField: OwnField) {
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    // Una sola RPC (reservas propias + servicio + nombre de la contraparte). Antes eran dos
    // requests encadenadas: bookings y luego profiles_public con .in(ids).
    const { data, error } = await supabase.rpc('my_bookings', {
      as_role: ownField === 'client_id' ? 'client' : 'professional',
    });

    if (error) {
      setError(getFriendlyErrorMessage(error));
      setLoading(false);
      return;
    }

    const rows = parseRowsOrDrop(myBookingRowSchema, data ?? [], `useBookingsList.${ownField}`);

    setBookings(rows.map((r) => ({
      id: r.id,
      status: r.status,
      scheduled_at: r.scheduled_at,
      price_agreed: r.price_agreed,
      notes: r.notes,
      created_at: r.created_at,
      client_id: r.client_id,
      professional_id: r.professional_id,
      services: r.service_title !== null && r.service_price_unit !== null
        ? { title: r.service_title, price_unit: r.service_price_unit }
        : null,
      otherPartyName: r.other_party_name,
    })));
    setLoading(false);
  }, [ownField]);

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
    // Actualización optimista: no esperar a que la suscripción realtime traiga el cambio de
    // vuelta (puede tardar o no llegar) - la propia mutación ya confirmó el nuevo estado.
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
  });

  return { bookings, loading, error, pendingIds, updateStatus };
}
