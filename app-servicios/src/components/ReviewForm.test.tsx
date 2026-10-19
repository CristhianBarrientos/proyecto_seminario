import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewForm from './ReviewForm';
import type { MyReview } from '../lib/useMyReviews';

// En jsdom los web components de Stencil no se hidratan: IonTextarea no recibe sus propiedades (maxlength) ni emite
// ionInput. Se sustituye SOLO ese componente por un <textarea> común que traduce el evento, para ejercitar la lógica
// real del formulario (el resto de Ionic, botones incluidos, se usa tal cual).
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  return {
    ...actual,
    IonTextarea: (props: {
      value?: string;
      maxlength?: number;
      disabled?: boolean;
      placeholder?: string;
      'aria-label'?: string;
      onIonInput?: (e: { detail: { value: string } }) => void;
    }) => (
      <textarea
        aria-label={props['aria-label']}
        placeholder={props.placeholder}
        value={props.value ?? ''}
        maxLength={props.maxlength}
        disabled={props.disabled}
        onChange={(e) => props.onIonInput?.({ detail: { value: e.target.value } })}
      />
    ),
  };
});

const existing: MyReview = { id: 'r1', rating: 4, comment: 'Muy bien', edited: false };

function setup(overrides: Partial<React.ComponentProps<typeof ReviewForm>> = {}) {
  const props = {
    existing: undefined,
    professionalName: 'Carlos',
    onSubmit: vi.fn().mockResolvedValue(null),
    onUpdate: vi.fn().mockResolvedValue(null),
    onDelete: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  const utils = render(<ReviewForm {...props} />);
  return { ...props, ...utils };
}

const ionButton = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('ion-button')].find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;

const isDisabled = (el: HTMLElement | undefined) =>
  !!el && (el.hasAttribute('disabled') || (el as HTMLElement & { disabled?: boolean }).disabled === true);

const COMMENT_LABEL = 'Comentario de tu reseña';
const typeComment = (value: string) => fireEvent.change(screen.getByLabelText(COMMENT_LABEL), { target: { value } });

describe('<ReviewForm /> sin reseña previa', () => {
  it('ofrece "Calificar profesional" y abre el formulario con el aviso de que es pública', () => {
    const { container } = setup();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    expect(screen.getByText(/cómo te fue con Carlos/i)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByText(/Tu reseña es pública/)).toBeTruthy();
    expect(screen.getByText(/perfil de Carlos/)).toBeTruthy();
  });

  it('no deja publicar sin estrellas', () => {
    const { container, onSubmit } = setup();
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    const publish = ionButton(container, 'Publicar reseña');
    expect(isDisabled(publish)).toBe(true);
    fireEvent.click(publish!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('publica con las estrellas y el comentario elegidos, y se cierra si salió bien', async () => {
    const { container, onSubmit } = setup();
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    fireEvent.click(screen.getByRole('radio', { name: '4 estrellas' }));
    typeComment('Llegó a tiempo');
    fireEvent.click(ionButton(container, 'Publicar reseña')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(4, 'Llegó a tiempo'));
    await waitFor(() => expect(ionButton(container, 'Calificar profesional')).toBeTruthy());
  });

  it('si falla, el formulario sigue abierto con lo escrito y muestra el motivo junto a los botones', async () => {
    const { container, onSubmit } = setup({ onSubmit: vi.fn().mockResolvedValue('Solo se puede reseñar un servicio completado') });
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    fireEvent.click(screen.getByRole('radio', { name: '2 estrellas' }));
    typeComment('Tardó demasiado');
    fireEvent.click(ionButton(container, 'Publicar reseña')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(2, 'Tardó demasiado'));
    expect(ionButton(container, 'Publicar reseña')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '2 estrellas' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText(COMMENT_LABEL) as HTMLTextAreaElement).value).toBe('Tardó demasiado');
    expect(screen.getByRole('alert').textContent).toBe('Solo se puede reseñar un servicio completado');
  });

  it('al cancelar y volver a abrir, el error anterior ya no aparece', async () => {
    const { container } = setup({ onSubmit: vi.fn().mockResolvedValue('Falló') });
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    fireEvent.click(screen.getByRole('radio', { name: '3 estrellas' }));
    fireEvent.click(ionButton(container, 'Publicar reseña')!);
    await screen.findByRole('alert');
    fireEvent.click(ionButton(container, 'Cancelar')!);
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('el comentario tiene tope de 500 caracteres', () => {
    const { container } = setup();
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    expect((screen.getByLabelText(COMMENT_LABEL) as HTMLTextAreaElement).maxLength).toBe(500);
  });

  it('cancelar vuelve al botón sin enviar nada', () => {
    const { container, onSubmit } = setup();
    fireEvent.click(ionButton(container, 'Calificar profesional')!);
    fireEvent.click(ionButton(container, 'Cancelar')!);
    expect(ionButton(container, 'Calificar profesional')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('<ReviewForm /> con reseña previa', () => {
  it('muestra la reseña propia, con "editada" solo si se modificó', () => {
    const { container, rerender, ...props } = setup({ existing });
    expect(screen.getByText('Tu reseña')).toBeTruthy();
    expect(screen.getByText('Muy bien')).toBeTruthy();
    expect(screen.queryByText('(editada)')).toBeNull();
    expect(ionButton(container, 'Calificar profesional')).toBeUndefined();

    rerender(
      <ReviewForm
        existing={{ ...existing, edited: true }}
        professionalName="Carlos"
        onSubmit={props.onSubmit}
        onUpdate={props.onUpdate}
        onDelete={props.onDelete}
      />,
    );
    expect(screen.getByText('(editada)')).toBeTruthy();
  });

  it('editar: precarga lo anterior y guarda con onUpdate', async () => {
    const { container, onUpdate, onSubmit } = setup({ existing });
    fireEvent.click(ionButton(container, 'Editar')!);
    expect(screen.getByRole('radio', { name: '4 estrellas' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText(COMMENT_LABEL) as HTMLTextAreaElement).value).toBe('Muy bien');
    fireEvent.click(screen.getByRole('radio', { name: '5 estrellas' }));
    typeComment('Mejoró mucho');
    fireEvent.click(ionButton(container, 'Guardar cambios')!);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(existing, 5, 'Mejoró mucho'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('eliminar pide confirmación y solo borra con "Sí, eliminar"', async () => {
    const { container, onDelete } = setup({ existing });
    fireEvent.click(ionButton(container, 'Eliminar')!);
    expect(screen.getByText('¿Eliminar tu reseña?')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(ionButton(container, 'Conservarla')!);
    expect(screen.getByText('Muy bien')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(ionButton(container, 'Eliminar')!);
    fireEvent.click(ionButton(container, 'Sí, eliminar')!);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(existing));
  });

  it('si eliminar falla muestra el motivo y mantiene la reseña a la vista de la confirmación', async () => {
    const { container } = setup({ existing, onDelete: vi.fn().mockResolvedValue('No se pudo eliminar') });
    fireEvent.click(ionButton(container, 'Eliminar')!);
    fireEvent.click(ionButton(container, 'Sí, eliminar')!);
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo eliminar');
    expect(screen.getByText('¿Eliminar tu reseña?')).toBeTruthy();
  });
});
