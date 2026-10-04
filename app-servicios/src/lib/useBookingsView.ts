import { useMemo, useState } from 'react';
import type { BookingListItem } from './useBookingsList';

export type BookingFilter = 'todas' | 'pendientes' | 'aceptadas' | 'canceladas' | 'completadas';

const FILTER_STATUSES: Record<Exclude<BookingFilter, 'todas'>, string[]> = {
  pendientes: ['solicitado'],
  aceptadas: ['aceptado', 'en_curso'],
  canceladas: ['cancelado'],
  completadas: ['completado'],
};

/** Solo las reservas terminales se pueden ocultar (lo impone también hide_bookings en la DB). */
export const isHideable = (b: BookingListItem) => b.status === 'cancelado' || b.status === 'completado';

/**
 * Filtro por estado + modo selección para ocultar solicitudes. Compartido por ClientBookings y
 * ProfessionalBookings; la selección se limpia al cambiar de filtro para no ocultar algo que ya
 * no se ve en pantalla.
 */
export function useBookingsView(
  bookings: BookingListItem[],
  hideBookings: (ids: string[]) => Promise<boolean>,
) {
  const [filter, setFilterState] = useState<BookingFilter>('todas');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hiding, setHiding] = useState(false);

  const filtered = useMemo(
    () => (filter === 'todas' ? bookings : bookings.filter((b) => FILTER_STATUSES[filter].includes(b.status))),
    [bookings, filter],
  );
  const hideableIds = useMemo(() => filtered.filter(isHideable).map((b) => b.id), [filtered]);
  // Descarta ids que ya no existen (p. ej. cambió por realtime).
  const selectedIds = useMemo(() => hideableIds.filter((id) => selected.has(id)), [hideableIds, selected]);

  const setFilter = (next: BookingFilter) => {
    setFilterState(next);
    setSelected(new Set());
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelected(new Set());
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allSelected = hideableIds.length > 0 && selectedIds.length === hideableIds.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(hideableIds));

  const hideSelected = async () => {
    if (selectedIds.length === 0 || hiding) return;
    setHiding(true);
    try {
      if (await hideBookings(selectedIds)) {
        setSelected(new Set());
        setSelectMode(false);
      }
    } finally {
      setHiding(false);
    }
  };

  return {
    filter, setFilter, filtered, selectMode, toggleSelectMode,
    selected: new Set(selectedIds), toggle, hideableCount: hideableIds.length,
    allSelected, toggleAll, hideSelected, hiding,
  };
}
