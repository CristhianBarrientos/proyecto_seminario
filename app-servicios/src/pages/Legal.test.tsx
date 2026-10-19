import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Legal from './Legal';
import { LEGAL_DOCS, LEGAL_UPDATED, SUPPORT_EMAIL, type LegalKind } from '../lib/legalContent';

const renderLegal = (kind: LegalKind) =>
  render(
    <MemoryRouter>
      <Legal kind={kind} />
    </MemoryRouter>,
  );

describe('contenido legal', () => {
  it.each(['privacidad', 'terminos'] as const)('%s: toda sección tiene título y contenido, sin textos pendientes', (kind) => {
    const { sections } = LEGAL_DOCS[kind];
    expect(sections.length).toBeGreaterThan(5);
    for (const s of sections) {
      expect(s.heading.trim()).not.toBe('');
      expect((s.paragraphs?.length ?? 0) + (s.items?.length ?? 0)).toBeGreaterThan(0);
    }
    // Marcas de texto pendiente. `TODO` va en mayúsculas y como palabra: "todos" es español normal.
    const texto = JSON.stringify(LEGAL_DOCS[kind]);
    expect(texto).not.toMatch(/\bTODO\b|\bXXX\b/);
    expect(texto).not.toMatch(/lorem ipsum|\[[^\]]*completar[^\]]*\]/i);
  });

  it('cada documento tiene una sección con el canal de contacto', () => {
    for (const kind of ['privacidad', 'terminos'] as const) {
      expect(LEGAL_DOCS[kind].sections.some((s) => s.contact)).toBe(true);
    }
  });
});

describe('<Legal />', () => {
  it.each(['privacidad', 'terminos'] as const)('%s: muestra título, fecha y todas las secciones', (kind) => {
    renderLegal(kind);
    const doc = LEGAL_DOCS[kind];
    expect(screen.getByRole('heading', { level: 1, name: doc.title })).toBeTruthy();
    expect(screen.getByText(`Última actualización: ${LEGAL_UPDATED}`)).toBeTruthy();
    for (const s of doc.sections) {
      expect(screen.getByRole('heading', { level: 2, name: s.heading })).toBeTruthy();
    }
  });

  it('sin correo de soporte lo dice con honestidad, y con correo lo publica como enlace', () => {
    renderLegal('privacidad');
    if (SUPPORT_EMAIL === null) {
      expect(screen.getByText(/Todavía no hay un correo de soporte/)).toBeTruthy();
    } else {
      const link = screen.getByRole('link', { name: SUPPORT_EMAIL });
      expect(link.getAttribute('href')).toBe(`mailto:${SUPPORT_EMAIL}`);
    }
  });

  it('enlaza de vuelta al inicio y al otro documento', () => {
    renderLegal('privacidad');
    const nav = screen.getAllByRole('link');
    const hrefs = nav.map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/terminos');
    expect(within(document.body).getByRole('link', { name: 'Términos de uso' })).toBeTruthy();
  });
});
