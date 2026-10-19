import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = {
  insert: [] as unknown[],
  update: [] as unknown[],
  del: [] as unknown[],
  inFilter: [] as unknown[],
};
let rows: unknown[] = [];
let loadFails = false;
let failNext: { code: string; message: string } | null = null;

const loadResult = () =>
  Promise.resolve(loadFails ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: rows, error: null });

const result = () => {
  const error = failNext;
  failNext = null;
  return Promise.resolve({ error });
};

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ in: (col: string, ids: string[]) => { calls.inFilter.push([col, ids]); return loadResult(); } }),
      }),
      insert: (v: unknown) => { calls.insert.push(v); return result(); },
      update: (v: unknown) => ({ eq: (col: string, val: string) => { calls.update.push([v, col, val]); return result(); } }),
      delete: () => ({ eq: (col: string, val: string) => { calls.del.push([col, val]); return result(); } }),
    }),
  },
}));

import { useMyReviews, type MyReview } from './useMyReviews';
import type { BookingListItem } from './useBookingsList';

const booking = (id: string, status: string) =>
  ({ id, status, professional_id: 'pro-1', client_id: 'cli-1', otherPartyName: 'Carlos' }) as unknown as BookingListItem;

const bookings = [booking('b1', 'completado'), booking('b2', 'solicitado')];

beforeEach(() => {
  calls.insert = [];
  calls.update = [];
  calls.del = [];
  calls.inFilter = [];
  rows = [];
  loadFails = false;
  failNext = null;
});

describe('useMyReviews', () => {
  it('carga mis reseñas por reserva y marca como editada la que tiene updated_at', async () => {
    rows = [{ id: 'r1', booking_id: 'b1', rating: 4, comment: 'Bien', updated_at: '2026-10-20T10:00:00Z' }];
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.reviewByBooking.get('b1')).toEqual({ id: 'r1', rating: 4, comment: 'Bien', edited: true });
  });

  it('solo pide las reseñas de las reservas completadas (no todo el historial)', async () => {
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(calls.inFilter[0]).toEqual(['booking_id', ['b1']]);
  });

  it('si la carga falla igual queda listo (no oculta "Calificar") y muestra el error', async () => {
    loadFails = true;
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toMatch(/Ocurrió un problema/);
  });

  it('sin reservas completadas no hay nada que cargar y queda listo', async () => {
    const { result } = renderHook(() => useMyReviews('cli-1', [booking('b2', 'solicitado')]));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.reviewByBooking.size).toBe(0);
  });

  it('publicar: manda la reserva, el profesional y el comentario recortado', async () => {
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let outcome: string | null = 'sin ejecutar';
    await act(async () => { outcome = await result.current.submitReview(bookings[0], 5, '  Excelente  '); });
    expect(outcome).toBeNull();
    expect(calls.insert[0]).toEqual({ booking_id: 'b1', client_id: 'cli-1', professional_id: 'pro-1', rating: 5, comment: 'Excelente' });
  });

  it('un comentario en blanco se guarda como null, no como texto vacío', async () => {
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.submitReview(bookings[0], 3, '    '); });
    expect((calls.insert[0] as { comment: unknown }).comment).toBeNull();
  });

  it('editar y eliminar apuntan a la reseña por su id', async () => {
    const mine: MyReview = { id: 'r1', rating: 4, comment: 'Bien', edited: false };
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.updateReview(mine, 2, 'Cambié de opinión'); });
    expect(calls.update[0]).toEqual([{ rating: 2, comment: 'Cambié de opinión' }, 'id', 'r1']);
    await act(async () => { await result.current.deleteReview(mine); });
    expect(calls.del[0]).toEqual(['id', 'r1']);
  });

  it('si la base rechaza (p. ej. el trabajo no está completado) devuelve el mensaje para el formulario', async () => {
    const { result } = renderHook(() => useMyReviews('cli-1', bookings));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    failNext = { code: 'P0001', message: 'Solo se puede reseñar un servicio completado' };
    let outcome: string | null = null;
    await act(async () => { outcome = await result.current.submitReview(bookings[0], 5, ''); });
    expect(outcome).toBe('Solo se puede reseñar un servicio completado');
  });
});
