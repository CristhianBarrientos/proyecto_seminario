import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RenderOptions = Record<string, (arg?: string) => void> & { sitekey: string; appearance: string };

describe('TurnstileWidget', () => {
  let options: RenderOptions;
  const api = {
    render: vi.fn((_el: HTMLElement, opts: RenderOptions) => {
      options = opts;
      return 'widget-1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };

  // Se importa despues de fijar el env y window.turnstile: loadTurnstile() resuelve de inmediato si ya existe.
  async function setup() {
    vi.resetModules();
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const { default: TurnstileWidget } = await import('./TurnstileWidget');
    return TurnstileWidget;
  }

  beforeEach(() => {
    api.render.mockClear();
    api.reset.mockClear();
    api.remove.mockClear();
    window.turnstile = api;
  });

  afterEach(() => {
    delete window.turnstile;
    vi.unstubAllEnvs();
  });

  it('renderiza en modo interaction-only con la site key y entrega el token', async () => {
    const TurnstileWidget = await setup();
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(options.sitekey).toBe('1x00000000000000000000AA');
    expect(options.appearance).toBe('interaction-only');

    act(() => options.callback('tok-1'));
    expect(onToken).toHaveBeenLastCalledWith('tok-1');
  });

  it('descarta el token cuando expira o vence el tiempo', async () => {
    const TurnstileWidget = await setup();
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    act(() => options.callback('tok-1'));
    act(() => options['expired-callback']());
    expect(onToken).toHaveBeenLastCalledWith(null);

    act(() => options.callback('tok-2'));
    act(() => options['timeout-callback']());
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('reset() pide un token nuevo y limpia el anterior (los tokens son de un solo uso)', async () => {
    const TurnstileWidget = await setup();
    const ref = createRef<{ reset: () => void }>();
    const onToken = vi.fn();
    render(<TurnstileWidget ref={ref} onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    act(() => options.callback('tok-1'));
    act(() => ref.current?.reset());

    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('un error del reto avisa que no esta disponible y muestra el mensaje', async () => {
    const TurnstileWidget = await setup();
    const onToken = vi.fn();
    const onUnavailable = vi.fn();
    render(<TurnstileWidget onToken={onToken} onUnavailable={onUnavailable} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    act(() => options['error-callback']());

    expect(onUnavailable).toHaveBeenLastCalledWith(true);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la verificación');

    // Si luego el reto se resuelve, el aviso desaparece.
    act(() => options.callback('tok-ok'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onUnavailable).toHaveBeenLastCalledWith(false);
  });

  it('al desmontar quita el widget y limpia el token', async () => {
    const TurnstileWidget = await setup();
    const onToken = vi.fn();
    const { unmount } = render(<TurnstileWidget onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    unmount();

    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(onToken).toHaveBeenLastCalledWith(null);
  });
});
