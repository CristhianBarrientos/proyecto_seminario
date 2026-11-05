import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TurnstileWidget, { type TurnstileHandle } from './TurnstileWidget';

// loadTurnstile se simula: el primer intento falla (sin red / bloqueado) y el siguiente funciona.
const loadTurnstile = vi.hoisted(() => vi.fn());
vi.mock('../lib/captcha', () => ({ loadTurnstile, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }));

describe('TurnstileWidget: recuperacion sin recargar la pagina', () => {
  const api = { render: vi.fn(() => 'widget-1'), reset: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    loadTurnstile.mockReset();
    api.render.mockClear();
    api.reset.mockClear();
  });

  it('si la carga falla, reset() reintenta y crea el widget', async () => {
    loadTurnstile.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue(api);
    const ref = createRef<TurnstileHandle>();
    const onUnavailable = vi.fn();
    render(<TurnstileWidget ref={ref} onToken={vi.fn()} onUnavailable={onUnavailable} />);

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith(true));
    expect(api.render).not.toHaveBeenCalled();

    act(() => ref.current?.reset());

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(loadTurnstile).toHaveBeenCalledTimes(2);
  });

  it('al volver la conexion (evento online) reintenta solo', async () => {
    loadTurnstile.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue(api);
    const onUnavailable = vi.fn();
    render(<TurnstileWidget onToken={vi.fn()} onUnavailable={onUnavailable} />);
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith(true));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
  });

  it('no crea un segundo widget si ya existe: reset() solo pide un token nuevo', async () => {
    loadTurnstile.mockResolvedValue(api);
    const ref = createRef<TurnstileHandle>();
    render(<TurnstileWidget ref={ref} onToken={vi.fn()} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));

    act(() => ref.current?.reset());

    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.reset).toHaveBeenCalledWith('widget-1');
  });
});
