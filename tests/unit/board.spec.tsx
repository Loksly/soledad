// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { Board } from '../../src/ui/board/Board';
import * as game from '../../src/app/session';
import { KLONDIKE_DEFAULT } from '../../src/core/games';
import { ref } from '../../src/core/types';
import { pileOf } from '../../src/core/engine';

/**
 * Lo que se prueba de la interfaz es que el tablero refleja el estado y que un movimiento
 * ilegal NO lo cambia. Nada de píxeles ni de animaciones (docs/09 §3.5).
 */

const DECK = { folder: 'Vertical2', back: 'blueBack' };

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  game.start('klondike', KLONDIKE_DEFAULT, 12345, null);
});

afterEach(() => {
  game.stopTimer();
  game.clear();
  render(null, host);
  host.remove();
});

const draw = (): void => {
  render(<Board deck={DECK} animations={false} />, host);
};

describe('el tablero', () => {
  it('pinta las 52 cartas, cada una un nodo con su imagen', () => {
    draw();
    const cards = host.querySelectorAll('img.card');
    expect(cards).toHaveLength(52);

    for (const card of cards) {
      const src = card.getAttribute('src') ?? '';
      expect(src.startsWith('/assets/cards/Vertical2/')).toBe(true);
      expect(src.endsWith('.webp')).toBe(true);
    }
  });

  it('coloca cada carta con transform, nunca con left/top', () => {
    draw();
    const first = host.querySelector('img.card') as HTMLElement;
    expect(first.style.transform).toContain('translate3d');
    // left/top fuerzan layout y matan los 60 fps (docs/09 §8 nº 10).
    expect(first.style.left).toBe('');
    expect(first.style.top).toBe('');
  });

  it('las cartas del mazo se pintan boca abajo, con el reverso', () => {
    draw();
    const backs = [...host.querySelectorAll('img.card')].filter(
      (card) => card.getAttribute('src') === '/assets/cards/Vertical2/blueBack.webp',
    );
    // 24 en el mazo + 21 boca abajo en el tablero = 45.
    expect(backs).toHaveLength(45);
  });

  it('dibuja un hueco por cada pila del juego', () => {
    draw();
    // Klondike: 7 columnas + 4 fundaciones + mazo + descarte.
    expect(host.querySelectorAll('.slot')).toHaveLength(13);
  });

  it('un movimiento ilegal no cambia el estado', () => {
    const before = JSON.stringify(game.state.value);
    // El 3 sobre el 5, sin ser de color contrario ni consecutivo: rechazado.
    const moved = game.apply({
      kind: 'move',
      from: ref('tableau', 0),
      to: ref('tableau', 1),
      count: 1,
    });
    expect(moved).toBe(false);
    expect(JSON.stringify(game.state.value)).toBe(before);
  });

  it('robar del mazo mueve una carta al descarte', () => {
    const stockBefore = pileOf(game.state.value!, ref('stock', 0)).length;
    expect(game.apply({ kind: 'draw' })).toBe(true);
    expect(pileOf(game.state.value!, ref('stock', 0))).toHaveLength(stockBefore - 1);
    expect(pileOf(game.state.value!, ref('waste', 0))).toHaveLength(1);

    draw();
    // La carta del descarte se ve, boca arriba.
    const waste = pileOf(game.state.value!, ref('waste', 0))[0]!;
    const node = [...host.querySelectorAll('img.card')].find(
      (card) => card.getAttribute('src')?.includes('blueBack') === false,
    );
    expect(node).toBeDefined();
    expect(waste.faceUp).toBe(true);
  });

  it('deshacer devuelve el tablero exactamente a como estaba', () => {
    const before = JSON.stringify(game.state.value);
    game.apply({ kind: 'draw' });
    expect(JSON.stringify(game.state.value)).not.toBe(before);
    game.undoMove();
    expect(JSON.stringify(game.state.value)).toBe(before);
  });

  it('la pista resalta una carta jugable', () => {
    const hint = game.requestHint();
    expect(hint).not.toBeNull();
    draw();
    expect(host.querySelectorAll('img.card-hint').length).toBeGreaterThan(0);
  });

  it('el tablero se recalcula al cambiar el tamaño, sin perder la partida', () => {
    draw();
    const moves = game.moves.value;
    window.dispatchEvent(new Event('resize'));
    draw();
    expect(host.querySelectorAll('img.card')).toHaveLength(52);
    expect(game.moves.value).toBe(moves);
  });
});
