import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import ProfessionalReviews from './ProfessionalReviews';

const review = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${n}`,
  rating: 5,
  comment: `Comentario ${n}`,
  created_at: `2026-10-${String(30 - n).padStart(2, '0')}T12:00:00Z`,
  updated_at: null,
  reviewer_name: 'María D.',
  service_title: 'Reparación de tubería',
  is_mine: false,
  ...extra,
});

const ionButton = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('ion-button')].find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;

beforeEach(() => {
  rpc.mockReset();
});

describe('<ProfessionalReviews />', () => {
  it('sin reseñas muestra el mensaje vacío', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<ProfessionalReviews professionalId="p1" emptyText="Todavía no tiene reseñas." />);
    expect(await screen.findByText('Todavía no tiene reseñas.')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('professional_reviews', { p_professional_id: 'p1', p_limit: 10, p_before: null });
  });

  it('muestra autor abreviado, servicio, comentario, "editada" y "Tu reseña"', async () => {
    rpc.mockResolvedValue({ data: [review(1, { updated_at: '2026-10-29T10:00:00Z', is_mine: true })], error: null });
    render(<ProfessionalReviews professionalId="p1" />);
    expect(await screen.findByText('Comentario 1')).toBeTruthy();
    expect(screen.getByText('María D.')).toBeTruthy();
    expect(screen.getByText('Tu reseña')).toBeTruthy();
    expect(screen.getByText(/editada/)).toBeTruthy();
    expect(screen.getByText(/Reparación de tubería/)).toBeTruthy();
    expect(screen.queryByText('Ver más reseñas')).toBeNull();
  });

  it('pagina: "Ver más" pide la siguiente página desde la última fecha y no repite ids', async () => {
    const first = Array.from({ length: 10 }, (_, i) => review(i + 1));
    // la segunda página repite la ultima de la primera (como si una reseña nueva hubiera movido el corte)
    const second = [review(10), review(11)];
    rpc.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({ data: second, error: null });

    const { container } = render(<ProfessionalReviews professionalId="p1" />);
    await screen.findByText('Comentario 1');
    expect(screen.getAllByRole('listitem')).toHaveLength(10);

    fireEvent.click(ionButton(container, 'Ver más reseñas')!);
    await screen.findByText('Comentario 11');
    expect(rpc).toHaveBeenLastCalledWith('professional_reviews', {
      p_professional_id: 'p1',
      p_limit: 10,
      p_before: first[9].created_at,
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    await waitFor(() => expect(ionButton(container, 'Ver más reseñas')).toBeUndefined());
  });

  it('si la consulta falla muestra un mensaje y no el listado vacío', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } });
    render(<ProfessionalReviews professionalId="p1" emptyText="Todavía no tiene reseñas." />);
    expect(await screen.findByText(/Ocurrió un problema/)).toBeTruthy();
    expect(screen.queryByText('Todavía no tiene reseñas.')).toBeNull();
  });
});
