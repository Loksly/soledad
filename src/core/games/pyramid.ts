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
  type PyramidVariant,
  type Result,
  type SolitaireEngine,
  type Variant,
} from '../types';

export interface PyramidState extends GameState {
  readonly game: 'pyramid';
  readonly variant: PyramidVariant;
}

export const PYRAMID_DEFAULT: PyramidVariant = {
  game: 'pyramid',
  maxRedeals: 2,
  wasteSelfPairing: false,
};

export const PYRAMID_SIZE = 28; // 1+2+…+7
const ROWS = 7;
const STOCK = ref('stock', 0);
const WASTE = ref('waste', 0);
const REMOVED = ref('foundation', 0);

/**
 * Grafo de cobertura TABULADO, no calculado con aritmética al vuelo (docs/09 §8 nº 6).
 * La posición p de la fila r está cubierta por las dos de debajo. La fila 6 (base) es libre.
 */
const COVERED_BY: readonly (readonly number[])[] = (() => {
  const table: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const start = (row * (row + 1)) / 2;
    const below = ((row + 1) * (row + 2)) / 2;
    for (let i = 0; i <= row; i++) {
      table[start + i] = row === ROWS - 1 ? [] : [below + i, below + i + 1];
    }
  }
  return table;
})();

export const coveredBy = (position: number): readonly number[] => COVERED_BY[position] ?? [];

export const rowOf = (position: number): number => {
  let row = 0;
  while ((row + 1) * (row + 2) <= position * 2) row++;
  return row;
};

const peak = (index: number): PileRef => ref('peaks', index);
const cardAt = (state: PyramidState, index: number): Card | undefined => pileOf(state, peak(index))[0];

const asVariant = (variant: Variant): PyramidVariant =>
  variant.game === 'pyramid' ? variant : PYRAMID_DEFAULT;

export function deal(seed: number, variant: Variant): PyramidState {
  const v = asVariant(variant);
  const cards = shuffledDeck(seed).map((card) => flip(card, true));
  const piles: Record<string, readonly Card[]> = {};

  for (let i = 0; i < PYRAMID_SIZE; i++) {
    piles[pileKey(peak(i))] = [cards[i] as Card];
  }
  piles['stock:0'] = cards.slice(PYRAMID_SIZE).map((card) => flip(card, false));
  piles['waste:0'] = [];
  piles['foundation:0'] = [];

  return { game: 'pyramid', variant: v, seed, piles, moveCount: 0, redeals: 0, score: 0 };
}

/** Jugable = sus DOS tapadoras han desaparecido. Con una sola retirada, no vale (docs/03 §4). */
export function isPlayable(state: PyramidState, position: number): boolean {
  if (!cardAt(state, position)) return false;
  return coveredBy(position).every((child) => cardAt(state, child) === undefined);
}

const wasteTop = (state: PyramidState): Card | undefined => {
  const waste = pileOf(state, WASTE);
  return waste[waste.length - 1];
};

const cardOfRef = (state: PyramidState, target: PileRef): Card | undefined => {
  if (target.kind === 'peaks') return isPlayable(state, target.index) ? cardAt(state, target.index) : undefined;
  if (target.kind === 'waste') return wasteTop(state);
  return undefined;
};

export function applyMove(state: PyramidState, move: Move): Result<PyramidState> {
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
      });
    }

    case 'redeal': {
      if (pileOf(state, STOCK).length > 0) return illegal('Aún quedan cartas en el mazo.');
      if (state.redeals >= state.variant.maxRedeals) return illegal('No quedan pasadas.');
      const waste = pileOf(state, WASTE);
      if (waste.length === 0) return illegal('No hay cartas que devolver.');
      return ok({
        ...withPiles(state, {
          'stock:0': waste.slice().reverse().map((card) => flip(card, false)),
          'waste:0': [],
        }),
        redeals: state.redeals + 1,
        moveCount: state.moveCount + 1,
      });
    }

    case 'remove': {
      const targets = move.piles;
      if (targets.length !== 1 && targets.length !== 2) return illegal('Se retira 1 rey o 2 cartas.');

      const selfPair =
        targets.length === 2 &&
        targets.every((target) => target.kind === 'waste');
      if (selfPair && !state.variant.wasteSelfPairing) {
        return illegal('El descarte no empareja consigo mismo en esta variante.');
      }

      const cards: Card[] = [];
      if (selfPair) {
        const waste = pileOf(state, WASTE);
        if (waste.length < 2) return illegal('No hay dos cartas en el descarte.');
        cards.push(waste[waste.length - 1] as Card, waste[waste.length - 2] as Card);
      } else {
        const seen = new Set<string>();
        for (const target of targets) {
          if (seen.has(pileKey(target))) return illegal('No se puede usar dos veces la misma carta.');
          seen.add(pileKey(target));
          const card = cardOfRef(state, target);
          if (!card) return illegal('Esa carta no está jugable.');
          cards.push(card);
        }
      }

      const total = cards.reduce((sum, card) => sum + card.rank, 0);
      if (targets.length === 1 && total !== 13) return illegal('Sólo un rey se retira solo.');
      if (targets.length === 2 && total !== 13) return illegal('La pareja debe sumar 13.');

      const changes: Record<string, readonly Card[]> = {};
      let wasteRemovals = 0;
      for (const target of targets) {
        if (target.kind === 'peaks') changes[pileKey(target)] = [];
        else if (target.kind === 'waste') wasteRemovals++;
      }
      if (wasteRemovals > 0) {
        const waste = pileOf(state, WASTE);
        changes['waste:0'] = waste.slice(0, waste.length - wasteRemovals);
      }
      changes['foundation:0'] = [...pileOf(state, REMOVED), ...cards];

      return ok({
        ...withPiles(state, changes),
        moveCount: state.moveCount + 1,
        score: state.score + cards.length * 5,
      });
    }

    case 'move':
    case 'deal':
      return illegal('Movimiento inexistente en Pirámide.');
  }
}

export function legalMoves(state: PyramidState): Move[] {
  const kings: Move[] = [];
  const pairs: Move[] = [];

  const playable: PileRef[] = [];
  for (let i = 0; i < PYRAMID_SIZE; i++) {
    if (isPlayable(state, i)) playable.push(peak(i));
  }
  const top = wasteTop(state);
  const sources: PileRef[] = top ? [...playable, WASTE] : playable;

  for (const source of sources) {
    const card = cardOfRef(state, source);
    if (!card) continue;
    if (card.rank === 13) kings.push({ kind: 'remove', piles: [source] });
  }

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i] as PileRef;
      const b = sources[j] as PileRef;
      const cardA = cardOfRef(state, a);
      const cardB = cardOfRef(state, b);
      if (!cardA || !cardB) continue;
      if (cardA.rank + cardB.rank === 13) pairs.push({ kind: 'remove', piles: [a, b] });
    }
  }

  if (state.variant.wasteSelfPairing) {
    const waste = pileOf(state, WASTE);
    const first = waste[waste.length - 1];
    const second = waste[waste.length - 2];
    if (first && second && first.rank + second.rank === 13) {
      pairs.push({ kind: 'remove', piles: [WASTE, WASTE] });
    }
  }

  const stockMoves: Move[] = [];
  if (pileOf(state, STOCK).length > 0) stockMoves.push({ kind: 'draw' });
  else if (state.redeals < state.variant.maxRedeals && pileOf(state, WASTE).length > 0) {
    stockMoves.push({ kind: 'redeal' });
  }

  // Retirar de la pirámide vale más que quemar el descarte: prioriza lo que descubre tablero.
  const touchesPyramid = (move: Move): boolean =>
    move.kind === 'remove' && move.piles.some((p) => p.kind === 'peaks');
  const [pyramidPairs, wastePairs] = [
    pairs.filter(touchesPyramid),
    pairs.filter((move) => !touchesPyramid(move)),
  ];

  return [...kings.filter(touchesPyramid), ...pyramidPairs, ...kings.filter((m) => !touchesPyramid(m)), ...wastePairs, ...stockMoves];
}

/** Victoria: las 28 de la pirámide retiradas. Lo que quede en mazo/descarte da igual. */
export const isWon = (state: PyramidState): boolean => {
  for (let i = 0; i < PYRAMID_SIZE; i++) {
    if (cardAt(state, i)) return false;
  }
  return true;
};

export const isStuck = (state: PyramidState): boolean =>
  !isWon(state) && legalMoves(state).length === 0;

export function autoMove(state: PyramidState, from: PileRef): Move | null {
  if (from.kind === 'stock') {
    if (pileOf(state, STOCK).length > 0) return { kind: 'draw' };
    return state.redeals < state.variant.maxRedeals ? { kind: 'redeal' } : null;
  }
  const card = cardOfRef(state, from);
  if (!card) return null;
  if (card.rank === 13) return { kind: 'remove', piles: [from] };
  return (
    legalMoves(state).find(
      (move) =>
        move.kind === 'remove' &&
        move.piles.length === 2 &&
        move.piles.some((p) => pileKey(p) === pileKey(from)),
    ) ?? null
  );
}

export const canAutoFinish = (): boolean => false;
export const score = (state: PyramidState): number => state.score;

export const pyramid: SolitaireEngine<PyramidState> = {
  id: 'pyramid',
  defaultVariant: PYRAMID_DEFAULT,
  deal,
  legalMoves,
  applyMove,
  isWon,
  isStuck,
  autoMove,
  score,
  canAutoFinish,
};
