import type { Card } from '../card';
import { pileOf } from '../engine';
import { isSafeToFoundation as safeKlondike } from '../games/klondike';
import { isSafeToFoundation as safeFreecell } from '../games/freecell';
import type { KlondikeState } from '../games/klondike';
import type { FreecellState } from '../games/freecell';
import { engineFor } from '../games';
import { ref, type GameId, type GameState, type Move, type PileRef } from '../types';

/**
 * Lo que hace viable la búsqueda no es el algoritmo, es esto: una heurística por juego y unas
 * "jugadas forzadas" que se aplican solas. Sin ellas, el árbol de FreeCell es inabarcable y el
 * solver no demuestra nada (que es justo lo que le pedimos: docs/04 §5).
 */

export interface SolverSpec {
  /** 0 = ganado. Cuanto menor, más cerca. */
  heuristic(state: GameState): number;
  /** Movimientos que siempre conviene hacer: no ramifican, sólo acortan. */
  autoplay(state: GameState): { state: GameState; moves: Move[] };
}

const foundationCards = (state: GameState): number =>
  Object.entries(state.piles)
    .filter(([key]) => key.startsWith('foundation:'))
    .reduce((sum, [, pile]) => sum + pile.length, 0);

const faceDownCards = (state: GameState): number =>
  Object.entries(state.piles)
    .filter(([key]) => key.startsWith('tableau:') || key.startsWith('peaks:'))
    .reduce((sum, [, pile]) => sum + pile.filter((card) => !card.faceUp).length, 0);

/** Cartas apiladas encima de las que la fundación necesita a continuación. Son el trabajo real. */
const buried = (state: GameState): number => {
  const needed = new Map<string, number>();
  for (const [key, pile] of Object.entries(state.piles)) {
    if (!key.startsWith('foundation:')) continue;
    const top = pile[pile.length - 1];
    if (pile.length === 0) continue;
    if (top && top.rank < 13) needed.set(top.suit, top.rank + 1);
  }
  for (const suit of ['spade', 'heart', 'diamond', 'club']) {
    if (!needed.has(suit)) needed.set(suit, 1);
  }

  let count = 0;
  for (const [key, pile] of Object.entries(state.piles)) {
    if (!key.startsWith('tableau:')) continue;
    for (let i = 0; i < pile.length; i++) {
      const card = pile[i] as Card;
      if (needed.get(card.suit) === card.rank) count += pile.length - 1 - i;
    }
  }
  return count;
};

const SUIT_INDEX: Readonly<Record<string, number>> = { spade: 0, heart: 1, diamond: 2, club: 3 };

/**
 * Aplica en bucle los movimientos a fundación que son seguros: nunca pierden una partida.
 * Colapsa cadenas enteras en un solo nodo, que es de donde sale casi toda la ganancia.
 *
 * Busca la jugada directamente en vez de filtrar `legalMoves`: se llama una vez por nodo
 * expandido y `legalMoves` es cara (construye decenas de movimientos que aquí se tirarían).
 */
const autoplaySafe = (
  game: GameId,
  sources: readonly PileRef[],
  isSafe: (state: GameState, card: Card) => boolean,
): SolverSpec['autoplay'] => {
  const engine = engineFor(game);
  return (start) => {
    let state = start;
    const moves: Move[] = [];

    for (;;) {
      let found: Move | null = null;
      for (const from of sources) {
        const pile = pileOf(state, from);
        const card = pile[pile.length - 1];
        if (!card?.faceUp || !isSafe(state, card)) continue;

        const to = ref('foundation', SUIT_INDEX[card.suit] ?? 0);
        const target = pileOf(state, to);
        const top = target[target.length - 1];
        const accepts = top ? top.rank === card.rank - 1 : card.rank === 1;
        if (!accepts) continue;

        found = { kind: 'move', from, to, count: 1 };
        break;
      }
      if (!found) return { state, moves };

      const result = engine.applyMove(state, found);
      if (!result.ok) return { state, moves };
      state = result.value;
      moves.push(found);
    }
  };
};

const KLONDIKE_SOURCES: readonly PileRef[] = [
  ref('waste', 0),
  ...Array.from({ length: 7 }, (_, i) => ref('tableau', i)),
];

const FREECELL_SOURCES: readonly PileRef[] = [
  ...Array.from({ length: 8 }, (_, i) => ref('tableau', i)),
  ...Array.from({ length: 4 }, (_, i) => ref('free', i)),
];

const boardCards = (state: GameState): number => {
  let count = 0;
  for (let i = 0; i < 28; i++) count += pileOf(state, ref('peaks', i)).length;
  return count;
};

/** Pares consecutivos que NO forman secuencia: cada uno es un movimiento futuro obligado. */
const disorder = (state: GameState, sameSuit: boolean): number => {
  let count = 0;
  for (const [key, pile] of Object.entries(state.piles)) {
    if (!key.startsWith('tableau:')) continue;
    for (let i = 1; i < pile.length; i++) {
      const above = pile[i] as Card;
      const below = pile[i - 1] as Card;
      const ordered = sameSuit
        ? above.suit === below.suit && above.rank === below.rank - 1
        : above.rank === below.rank - 1;
      if (!ordered) count++;
    }
  }
  return count;
};

export const SPECS: Readonly<Record<GameId, SolverSpec>> = {
  freecell: {
    heuristic: (state) => {
      const cells = Object.entries(state.piles).filter(
        ([key, pile]) => key.startsWith('free:') && pile.length > 0,
      ).length;
      return (52 - foundationCards(state)) * 2 + buried(state) + cells;
    },
    autoplay: autoplaySafe('freecell', FREECELL_SOURCES, (state, card) =>
      safeFreecell(state as FreecellState, card),
    ),
  },

  klondike: {
    heuristic: (state) =>
      (52 - foundationCards(state)) * 2 +
      faceDownCards(state) * 3 +
      pileOf(state, ref('stock', 0)).length * 0.1,
    autoplay: autoplaySafe('klondike', KLONDIKE_SOURCES, (state, card) =>
      safeKlondike(state as KlondikeState, card),
    ),
  },

  spider: {
    heuristic: (state) =>
      (104 - foundationCards(state)) * 1.5 + faceDownCards(state) * 2 + disorder(state, true),
    autoplay: (state) => ({ state, moves: [] }), // Spider ya retira las secuencias solo.
  },

  pyramid: {
    heuristic: (state) => boardCards(state) * 2 + pileOf(state, ref('stock', 0)).length * 0.05,
    autoplay: (state) => ({ state, moves: [] }),
  },

  tripeaks: {
    heuristic: (state) => boardCards(state) * 2 + faceDownCards(state),
    autoplay: (state) => ({ state, moves: [] }),
  },
};

export { disorder, foundationCards, faceDownCards };
