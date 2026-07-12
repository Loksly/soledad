import { flip, type Card } from '../card';
import { shuffledDeck } from '../deck';
import { pileOf, withPiles } from '../engine';
import {
  illegal,
  ok,
  pileKey,
  ref,
  type GameState,
  type Move,
  type PileRef,
  type Result,
  type SolitaireEngine,
  type TripeaksVariant,
  type Variant,
} from '../types';

export interface TripeaksState extends GameState {
  readonly game: 'tripeaks';
  readonly variant: TripeaksVariant;
  /** Longitud de la racha en curso: cada carta encadenada vale una más que la anterior. */
  readonly streak: number;
}

export const TRIPEAKS_DEFAULT: TripeaksVariant = { game: 'tripeaks', wrapAround: true };

export const TRIPEAKS_SIZE = 28;
const STOCK = ref('stock', 0);
const WASTE = ref('waste', 0);

/**
 * GRAFO DE COBERTURA TABULADO (docs/03 §5, docs/09 §8 nº 6).
 *
 * Filas: 3 + 6 + 9 + 10 = 28. Cada pico aporta 1+2+3 = 6 cartas; la fila base de 10 es común
 * y sus cartas se comparten entre picos vecinos.
 *
 *        0           1           2          fila 0  (índices 0–2)
 *      3   4       5   6       7   8        fila 1  (índices 3–8)
 *     9 10 11    12 13 14    15 16 17       fila 2  (índices 9–17)
 *   18 19 20 21 22 23 24 25 26 27           fila 3  (índices 18–27)
 *
 * NOTA para quien mantenga esto: el diagrama de docs/03 §5 dibuja 12 cartas en la fila 2, lo
 * que sumaría 31 y contradice el "3 × 6 = 18" del propio documento. La aritmética manda:
 * la fila 2 tiene 9. Cada carta de la fila 2 (índice 9+j) queda tapada por las de la base
 * 18+j y 19+j, así que la base 21 (x=6) la comparten el pico izquierdo y el central.
 */
const COVERED_BY: readonly (readonly number[])[] = [
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
  [10, 11],
  [12, 13],
  [13, 14],
  [15, 16],
  [16, 17],
  [18, 19],
  [19, 20],
  [20, 21],
  [21, 22],
  [22, 23],
  [23, 24],
  [24, 25],
  [25, 26],
  [26, 27],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
];

export const coveredBy = (position: number): readonly number[] => COVERED_BY[position] ?? [];

export const ROW_OF: readonly number[] = COVERED_BY.map((_, i) =>
  i < 3 ? 0 : i < 9 ? 1 : i < 18 ? 2 : 3,
);

/** Índice del pico (0,1,2) al que pertenece cada posición; la fila base no es de ninguno. */
export const PEAK_OF: readonly (0 | 1 | 2 | null)[] = COVERED_BY.map((_, i) => {
  if (i < 3) return i as 0 | 1 | 2;
  if (i < 9) return Math.floor((i - 3) / 2) as 0 | 1 | 2;
  if (i < 18) return Math.floor((i - 9) / 3) as 0 | 1 | 2;
  return null;
});

const peak = (index: number): PileRef => ref('peaks', index);
const cardAt = (state: TripeaksState, index: number): Card | undefined =>
  pileOf(state, peak(index))[0];

const asVariant = (variant: Variant): TripeaksVariant =>
  variant.game === 'tripeaks' ? variant : TRIPEAKS_DEFAULT;

export function deal(seed: number, variant: Variant): TripeaksState {
  const v = asVariant(variant);
  const cards = shuffledDeck(seed);
  const piles: Record<string, readonly Card[]> = {};

  // Sólo la fila base empieza boca arriba; el resto se voltea al quedar descubierto.
  for (let i = 0; i < TRIPEAKS_SIZE; i++) {
    piles[pileKey(peak(i))] = [flip(cards[i] as Card, ROW_OF[i] === 3)];
  }
  piles['waste:0'] = [flip(cards[TRIPEAKS_SIZE] as Card, true)];
  piles['stock:0'] = cards.slice(TRIPEAKS_SIZE + 1).map((card) => flip(card, false));

  return {
    game: 'tripeaks',
    variant: v,
    seed,
    piles,
    moveCount: 0,
    redeals: 0,
    score: 0,
    streak: 0,
  };
}

export const isUncovered = (state: TripeaksState, position: number): boolean =>
  coveredBy(position).every((child) => cardAt(state, child) === undefined);

export const isPlayable = (state: TripeaksState, position: number): boolean =>
  cardAt(state, position) !== undefined && isUncovered(state, position);

const wasteTop = (state: TripeaksState): Card | undefined => {
  const waste = pileOf(state, WASTE);
  return waste[waste.length - 1];
};

/** Escalera ±1, con envoltura A↔K si la variante la activa (docs/03 §5). */
export function chains(card: Card, target: Card, wrapAround: boolean): boolean {
  const diff = Math.abs(card.rank - target.rank);
  if (diff === 1) return true;
  return wrapAround && diff === 12; // A(1) y K(13)
}

/** Voltea las que hayan quedado descubiertas tras retirar una carta. */
function revealUncovered(state: TripeaksState): TripeaksState {
  const changes: Record<string, readonly Card[]> = {};
  for (let i = 0; i < TRIPEAKS_SIZE; i++) {
    const card = cardAt(state, i);
    if (!card || card.faceUp) continue;
    if (isUncovered(state, i)) changes[pileKey(peak(i))] = [flip(card, true)];
  }
  return Object.keys(changes).length > 0 ? withPiles(state, changes) : state;
}

export function applyMove(state: TripeaksState, move: Move): Result<TripeaksState> {
  switch (move.kind) {
    case 'draw': {
      const stock = pileOf(state, STOCK);
      if (stock.length === 0) return illegal('El mazo está vacío.');
      const card = stock[stock.length - 1] as Card;
      return ok({
        ...withPiles(state, {
          'stock:0': stock.slice(0, -1),
          'waste:0': [...pileOf(state, WASTE), flip(card, true)],
        }),
        moveCount: state.moveCount + 1,
        // Robar rompe la escalera: la siguiente carta encadenada vuelve a valer 1.
        streak: 0,
      });
    }

    case 'move': {
      if (move.from.kind !== 'peaks' || move.to.kind !== 'waste') {
        return illegal('Sólo se juegan cartas del tablero al descarte.');
      }
      if (!isPlayable(state, move.from.index)) return illegal('Esa carta está tapada.');

      const card = cardAt(state, move.from.index) as Card;
      if (!card.faceUp) return illegal('Esa carta está boca abajo.');
      const target = wasteTop(state);
      if (!target) return illegal('No hay carta activa en el descarte.');
      if (!chains(card, target, state.variant.wrapAround)) {
        return illegal('La carta no encadena con el descarte.');
      }

      // Cada carta encadenada vale una más que la anterior (1, 2, 3…). Robar reinicia la
      // racha. Es la puntuación de docs/03 §5.
      const streak = state.streak + 1;
      const cleared = revealUncovered(
        withPiles(state, {
          [pileKey(move.from)]: [],
          'waste:0': [...pileOf(state, WASTE), card],
        }),
      );
      const peakBonus = peakJustCleared(state, cleared, move.from.index) ? 15 : 0;

      return ok({
        ...cleared,
        moveCount: state.moveCount + 1,
        streak,
        score: state.score + streak + peakBonus,
      });
    }

    case 'redeal':
    case 'deal':
    case 'remove':
      return illegal('Movimiento inexistente en TriPeaks.');
  }
}

const peakJustCleared = (before: TripeaksState, after: TripeaksState, position: number): boolean => {
  const which = PEAK_OF[position];
  if (which === null || which === undefined) return false;
  const wasClear = (state: TripeaksState): boolean =>
    PEAK_OF.every((owner, i) => owner !== which || cardAt(state, i) === undefined);
  return !wasClear(before) && wasClear(after);
};

export function legalMoves(state: TripeaksState): Move[] {
  const moves: Move[] = [];
  const target = wasteTop(state);

  if (target) {
    for (let i = 0; i < TRIPEAKS_SIZE; i++) {
      const card = cardAt(state, i);
      if (!card?.faceUp || !isUncovered(state, i)) continue;
      if (chains(card, target, state.variant.wrapAround)) {
        moves.push({ kind: 'move', from: peak(i), to: WASTE, count: 1 });
      }
    }
  }
  // Las que destapan más tablero primero: una carta de fila alta abre dos.
  moves.sort((a, b) => {
    const rowA = a.kind === 'move' ? (ROW_OF[a.from.index] ?? 3) : 3;
    const rowB = b.kind === 'move' ? (ROW_OF[b.from.index] ?? 3) : 3;
    return rowA - rowB;
  });

  if (pileOf(state, STOCK).length > 0) moves.push({ kind: 'draw' });
  return moves;
}

export const isWon = (state: TripeaksState): boolean => {
  for (let i = 0; i < TRIPEAKS_SIZE; i++) {
    if (cardAt(state, i)) return false;
  }
  return true;
};

export const isStuck = (state: TripeaksState): boolean =>
  !isWon(state) && legalMoves(state).length === 0;

export function autoMove(state: TripeaksState, from: PileRef): Move | null {
  if (from.kind === 'stock') {
    return pileOf(state, STOCK).length > 0 ? { kind: 'draw' } : null;
  }
  if (from.kind !== 'peaks') return null;
  const move: Move = { kind: 'move', from, to: WASTE, count: 1 };
  return applyMove(state, move).ok ? move : null;
}

export const canAutoFinish = (): boolean => false;
export const score = (state: TripeaksState): number => state.score;

export const tripeaks: SolitaireEngine<TripeaksState> = {
  id: 'tripeaks',
  defaultVariant: TRIPEAKS_DEFAULT,
  deal,
  legalMoves,
  applyMove,
  isWon,
  isStuck,
  autoMove,
  score,
  canAutoFinish,
};
