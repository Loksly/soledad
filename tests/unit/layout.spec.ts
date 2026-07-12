import { describe, expect, it } from 'vitest';
import { computeLayout, boardHeight, CARD_ASPECT, slotFor } from '../../src/ui/layout/geometry';
import { engineFor, DEFAULT_VARIANTS } from '../../src/core/games';
import { GAME_IDS, ref, type GameId } from '../../src/core/types';
import { pileOf } from '../../src/core/engine';

/**
 * Lo único que se prueba de la interfaz: que el tablero NO SE DESBORDA (docs/09 §3.5). Las
 * pruebas de píxeles y de animaciones son frágiles y cuestan más de lo que ahorran.
 */

const NO_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH = { top: 44, right: 0, bottom: 34, left: 0 };

// Los tamaños que exige docs/05 §3.6, en las dos orientaciones.
const VIEWPORTS = [
  { name: 'móvil pequeño', width: 360, height: 640 },
  { name: 'móvil típico', width: 412, height: 915 },
  { name: 'tablet', width: 1280, height: 800 },
  { name: 'móvil apaisado', width: 915, height: 412 },
  { name: 'pantalla dividida', width: 360, height: 380 },
];

const depthsOf = (game: GameId): Record<string, number> => {
  const state = engineFor(game).deal(12345, DEFAULT_VARIANTS[game]);
  const depths: Record<string, number> = {};
  for (const [key, pile] of Object.entries(state.piles)) depths[key] = pile.length;
  return depths;
};

const layoutOf = (game: GameId, viewport: { width: number; height: number }) =>
  computeLayout(game, viewport, NO_SAFE, depthsOf(game));

describe.each(GAME_IDS)('layout de %s', (game) => {
  it.each(VIEWPORTS)('no desborda en $name ($width×$height)', (viewport) => {
    const layout = computeLayout(game, viewport, NO_SAFE);

    for (const slot of layout.slots) {
      expect(slot.x, `${game} ${slot.pile.kind}:${slot.pile.index} se sale por la izquierda`).toBeGreaterThanOrEqual(-1);
      expect(
        slot.x + layout.cardW,
        `${game} ${slot.pile.kind}:${slot.pile.index} se sale por la derecha`,
      ).toBeLessThanOrEqual(viewport.width + 1);
      expect(slot.y).toBeGreaterThanOrEqual(-1);
    }
  });

  it('respeta la relación 210:315 de los SVG', () => {
    const layout = computeLayout(game, { width: 412, height: 915 }, NO_SAFE);
    expect(layout.cardH / layout.cardW).toBeCloseTo(CARD_ASPECT, 5);
  });

  it('ninguna carta queda bajo el notch', () => {
    const layout = computeLayout(game, { width: 412, height: 915 }, NOTCH);
    for (const slot of layout.slots) {
      expect(slot.y).toBeGreaterThanOrEqual(NOTCH.top - 1);
    }
  });

  it('el reparto inicial cabe a lo alto en un móvil pequeño', () => {
    const viewport = { width: 360, height: 640 };
    const layout = layoutOf(game, viewport);
    expect(boardHeight(layout, depthsOf(game))).toBeLessThanOrEqual(viewport.height);
  });

  /**
   * Las dos pruebas siguientes existen porque el tablero se probó EN UN MÓVIL y era injugable:
   * cartas diminutas amontonadas arriba y media pantalla de tapete vacío. Un layout que "no
   * desborda" no basta; también tiene que usar la pantalla que tiene.
   */
  it.each([
    { name: 'Pixel 7 vertical', width: 412, height: 915 },
    { name: 'Pixel 7 apaisado', width: 915, height: 412 },
    { name: 'móvil pequeño', width: 360, height: 640 },
  ])('aprovecha el alto en $name (nada de media pantalla vacía)', (viewport) => {
    const layout = layoutOf(game, viewport);
    const used = boardHeight(layout, depthsOf(game));
    const usable = viewport.height - (layout.landscape ? 8 : 64);
    expect(used / usable, `${game} desperdicia el alto`).toBeGreaterThan(0.6);
  });

  it.each([
    { name: 'Pixel 7 vertical', width: 412, height: 915 },
    { name: 'Pixel 7 apaisado', width: 915, height: 412 },
  ])('la carta es lo bastante grande para el dedo en $name', (viewport) => {
    const layout = layoutOf(game, viewport);
    // 10 columnas en 412 px no dan para más de ~37 px de ancho: es el límite físico. Lo que no
    // se tolera es que la carta salga aún más pequeña por reservar alto que no se usa.
    expect(layout.cardW).toBeGreaterThanOrEqual(35);
  });

  it('tiene un hueco para cada pila del estado', () => {
    const state = engineFor(game).deal(1, DEFAULT_VARIANTS[game]);
    const layout = computeLayout(game, { width: 412, height: 915 }, NO_SAFE);
    for (const key of Object.keys(state.piles)) {
      const [kind, index] = key.split(':');
      const slot = slotFor(layout, ref(kind as 'tableau', Number(index)));
      expect(slot, `falta el hueco de ${key} en ${game}`).toBeDefined();
    }
  });
});

describe('solapamiento adaptativo', () => {
  // La pantalla que de verdad aprieta no es la estrecha, sino la ANCHA Y BAJA: ahí las cartas
  // salen grandes y una columna de Spider no cabe a lo alto ni de lejos. A 360 px las cartas
  // son tan pequeñas que caben 24 sin apretar nada.
  const SQUEEZED = { width: 1280, height: 500 };
  const ROOMY = { width: 1280, height: 1400 };

  it('la columna larga de Spider se aprieta cuando falta alto', () => {
    const squeezed = computeLayout('spider', SQUEEZED, NO_SAFE);
    const roomy = computeLayout('spider', ROOMY, NO_SAFE);

    const ratio = (layout: typeof squeezed): number =>
      (slotFor(layout, ref('tableau', 0))?.fanY ?? 0) / layout.cardH;

    expect(ratio(squeezed)).toBeLessThan(ratio(roomy));
    // Pero nunca por debajo del mínimo legible: hay que poder ver el índice de la esquina.
    expect(ratio(squeezed)).toBeGreaterThanOrEqual(0.079);
  });

  it('una columna de 24 cartas cabe, apretada o no', () => {
    for (const viewport of [SQUEEZED, { width: 360, height: 640 }, { width: 412, height: 915 }]) {
      const layout = computeLayout('spider', viewport, NO_SAFE);
      const depths: Record<string, number> = {};
      for (let i = 0; i < 10; i++) depths[`tableau:${i}`] = i === 0 ? 24 : 5;
      expect(boardHeight(layout, depths), `${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(
        viewport.height,
      );
    }
  });
});

describe('la pirámide y los picos', () => {
  it('la pirámide coloca sus 28 posiciones', () => {
    const layout = computeLayout('pyramid', { width: 412, height: 915 }, NO_SAFE);
    const peaks = layout.slots.filter((slot) => slot.pile.kind === 'peaks');
    expect(peaks).toHaveLength(28);
  });

  it('en TriPeaks, las cartas que tapan están por encima de las que tapan a otras', () => {
    const layout = computeLayout('tripeaks', { width: 412, height: 915 }, NO_SAFE);
    const y = (index: number): number => slotFor(layout, ref('peaks', index))?.y ?? 0;
    // La cúspide (0) queda por encima de la fila 1 (3), que queda por encima de la base (18).
    expect(y(0)).toBeLessThan(y(3));
    expect(y(3)).toBeLessThan(y(9));
    expect(y(9)).toBeLessThan(y(18));
  });

  it('el estado de TriPeaks encaja con los huecos del layout', () => {
    const state = engineFor('tripeaks').deal(1, DEFAULT_VARIANTS.tripeaks);
    expect(pileOf(state, ref('peaks', 27))).toHaveLength(1);
    const layout = computeLayout('tripeaks', { width: 412, height: 915 }, NO_SAFE);
    expect(slotFor(layout, ref('peaks', 27))).toBeDefined();
  });
});
