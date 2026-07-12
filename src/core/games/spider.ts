import { flip, stacksSameSuit, type Card } from '../card';
import { shuffledSpiderDeck } from '../deck';
import { emptyPiles, faceUpRun, isEmpty, pileOf, revealTop, withPiles } from '../engine';
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
  type SpiderVariant,
  type Variant,
} from '../types';

export interface SpiderState extends GameState {
  readonly game: 'spider';
  readonly variant: SpiderVariant;
}

export const SPIDER_DEFAULT: SpiderVariant = { game: 'spider', suits: 1 };

const TABLEAUX = 10;
const FOUNDATIONS = 8;
const columns = Array.from({ length: TABLEAUX }, (_, i) => ref('tableau', i));
const STOCK = ref('stock', 0);

const asVariant = (variant: Variant): SpiderVariant =>
  variant.game === 'spider' ? variant : SPIDER_DEFAULT;

export function deal(seed: number, variant: Variant): SpiderState {
  const v = asVariant(variant);
  const cards = shuffledSpiderDeck(seed, v.suits);
  const piles: Record<string, readonly Card[]> = {
    ...emptyPiles('tableau', TABLEAUX),
    ...emptyPiles('foundation', FOUNDATIONS),
  };

  // 54 al tablero: las 4 primeras columnas reciben 6; las 6 restantes, 5. Las 50 al mazo.
  let cursor = 0;
  for (let column = 0; column < TABLEAUX; column++) {
    const size = column < 4 ? 6 : 5;
    const pile: Card[] = [];
    for (let depth = 0; depth < size; depth++) {
      pile.push(flip(cards[cursor++] as Card, depth === size - 1));
    }
    piles[pileKey(ref('tableau', column))] = pile;
  }
  piles['stock:0'] = cards.slice(cursor).map((card) => flip(card, false));

  return { game: 'spider', variant: v, seed, piles, moveCount: 0, redeals: 0, score: 500 };
}

/**
 * LA regla de Spider (docs/03 §2, docs/09 §8 nº 4):
 *  - para APILAR basta valor uno menor, sea cual sea el palo;
 *  - para MOVER un grupo, ese grupo debe ser descendente Y del mismo palo.
 * Las dos cosas a la vez. Confundirlas convierte el juego en trivial.
 */
const movableRun = (pile: readonly Card[], count: number): readonly Card[] | null => {
  if (count < 1 || count > pile.length) return null;
  const run = pile.slice(pile.length - count);
  for (const card of run) if (!card.faceUp) return null;
  for (let i = 1; i < run.length; i++) {
    if (!stacksSameSuit(run[i] as Card, run[i - 1] as Card)) return null;
  }
  return run;
};

const tableauAccepts = (pile: readonly Card[], card: Card): boolean => {
  const top = pile[pile.length - 1];
  if (!top) return true; // Columna vacía: cualquier carta o secuencia válida.
  return top.faceUp && top.rank === card.rank + 1; // Cualquier palo.
};

/** Una secuencia completa K→A del mismo palo se retira sola a una fundación. */
const completedRun = (pile: readonly Card[]): boolean => {
  if (pile.length < 13) return false;
  const run = pile.slice(pile.length - 13);
  const bottom = run[0] as Card;
  if (bottom.rank !== 13 || !bottom.faceUp) return false;
  for (let i = 1; i < 13; i++) {
    if (!stacksSameSuit(run[i] as Card, run[i - 1] as Card)) return false;
    if (!(run[i] as Card).faceUp) return false;
  }
  return true;
};

const nextFoundation = (state: SpiderState): PileRef | null => {
  for (let i = 0; i < FOUNDATIONS; i++) {
    const candidate = ref('foundation', i);
    if (isEmpty(state, candidate)) return candidate;
  }
  return null;
};

/**
 * Tras cada movimiento se retiran las secuencias completas y se voltea lo que quede debajo.
 * Todo ello forma parte del MISMO Move: el jugador pulsa deshacer una vez y ve exactamente
 * lo contrario de lo que hizo (docs/04 §3).
 */
function collectRuns(state: SpiderState): SpiderState {
  let current = state;
  for (;;) {
    let changed = false;
    for (const column of columns) {
      const pile = pileOf(current, column);
      if (!completedRun(pile)) continue;
      const foundation = nextFoundation(current);
      if (!foundation) break;

      const run = pile.slice(pile.length - 13);
      const rest = revealTop(pile.slice(0, pile.length - 13));
      current = {
        ...withPiles(current, {
          [pileKey(column)]: rest,
          [pileKey(foundation)]: run,
        }),
        score: current.score + 100,
      };
      changed = true;
    }
    if (!changed) return current;
  }
}

export function applyMove(state: SpiderState, move: Move): Result<SpiderState> {
  switch (move.kind) {
    case 'deal': {
      const stock = pileOf(state, STOCK);
      if (stock.length === 0) return illegal('No quedan repartos.');
      // Prohibido repartir con una columna vacía (docs/03 §2).
      if (columns.some((column) => isEmpty(state, column))) {
        return illegal('No se puede repartir con una columna vacía.');
      }
      const changes: Record<string, readonly Card[]> = {};
      let cursor = stock.length;
      for (const column of columns) {
        const card = stock[--cursor] as Card;
        changes[pileKey(column)] = [...pileOf(state, column), flip(card, true)];
      }
      changes['stock:0'] = stock.slice(0, cursor);

      const dealt: SpiderState = {
        ...withPiles(state, changes),
        moveCount: state.moveCount + 1,
        score: Math.max(0, state.score - 1),
      };
      return ok(collectRuns(dealt));
    }

    case 'move': {
      if (move.from.kind !== 'tableau' || move.to.kind !== 'tableau') {
        return illegal('En Spider sólo se mueve entre columnas.');
      }
      if (pileKey(move.from) === pileKey(move.to)) return illegal('Origen y destino coinciden.');

      const source = pileOf(state, move.from);
      const moved = movableRun(source, move.count);
      if (!moved) return illegal('Un grupo sólo se mueve si es descendente y del mismo palo.');

      const target = pileOf(state, move.to);
      if (!tableauAccepts(target, moved[0] as Card)) {
        return illegal('La columna no acepta esa carta.');
      }

      const rest = revealTop(source.slice(0, source.length - moved.length));
      const moved_: SpiderState = {
        ...withPiles(state, {
          [pileKey(move.from)]: rest,
          [pileKey(move.to)]: [...target, ...moved],
        }),
        moveCount: state.moveCount + 1,
        score: Math.max(0, state.score - 1),
      };
      return ok(collectRuns(moved_));
    }

    case 'draw':
    case 'redeal':
    case 'remove':
      return illegal('Movimiento inexistente en Spider.');
  }
}

export function legalMoves(state: SpiderState): Move[] {
  const completes: Move[] = [];
  const reveals: Move[] = [];
  const sameSuit: Move[] = [];
  const toEmpty: Move[] = [];
  const other: Move[] = [];

  for (const from of columns) {
    const pile = pileOf(state, from);
    if (pile.length === 0) continue;
    const run = faceUpRun(pile);

    for (let count = 1; count <= run.length; count++) {
      const moved = movableRun(pile, count);
      if (!moved) break; // Si count no forma secuencia, count+1 tampoco.
      const head = moved[0] as Card;

      for (const to of columns) {
        if (pileKey(to) === pileKey(from)) continue;
        const target = pileOf(state, to);
        if (!tableauAccepts(target, head)) continue;
        if (target.length === 0 && count === pile.length) continue;

        const move: Move = { kind: 'move', from, to, count };
        const targetTop = target[target.length - 1];
        const revealsCard =
          count < pile.length && !(pile[pile.length - count - 1] as Card).faceUp;
        const completesRun =
          targetTop !== undefined &&
          targetTop.suit === head.suit &&
          target.length + count >= 13 &&
          completedRun([...target, ...moved]);

        if (completesRun) completes.push(move);
        else if (revealsCard) reveals.push(move);
        else if (targetTop !== undefined && targetTop.suit === head.suit) sameSuit.push(move);
        else if (target.length === 0) toEmpty.push(move); // Recurso escaso: se penaliza.
        else other.push(move);
      }
    }
  }

  const dealMoves: Move[] =
    pileOf(state, STOCK).length > 0 && !columns.some((column) => isEmpty(state, column))
      ? [{ kind: 'deal' }]
      : [];

  return [...completes, ...reveals, ...sameSuit, ...other, ...toEmpty, ...dealMoves];
}

export const isWon = (state: SpiderState): boolean => {
  let complete = 0;
  for (let i = 0; i < FOUNDATIONS; i++) {
    if (pileOf(state, ref('foundation', i)).length === 13) complete++;
  }
  return complete === FOUNDATIONS;
};

export const isStuck = (state: SpiderState): boolean =>
  !isWon(state) && legalMoves(state).length === 0;

export function autoMove(state: SpiderState, from: PileRef): Move | null {
  if (from.kind === 'stock') {
    return pileOf(state, STOCK).length > 0 && !columns.some((c) => isEmpty(state, c))
      ? { kind: 'deal' }
      : null;
  }
  const moves = legalMoves(state).filter(
    (move) => move.kind === 'move' && pileKey(move.from) === pileKey(from),
  );
  // legalMoves ya viene ordenada por calidad: completar > descubrir > mismo palo > … > vaciar.
  return moves[0] ?? null;
}

export const canAutoFinish = (): boolean => false; // Spider se resuelve solo al completar.
export const score = (state: SpiderState): number => state.score;

export const spider: SolitaireEngine<SpiderState> = {
  id: 'spider',
  defaultVariant: SPIDER_DEFAULT,
  deal,
  legalMoves,
  applyMove,
  isWon,
  isStuck,
  autoMove,
  score,
  canAutoFinish,
};
