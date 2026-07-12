import { SUITS, colorOf, flip, stacksAlternating, type Card, type Rank, type Suit } from '../card';
import { shuffledDeck } from '../deck';
import { emptyPiles, faceUpRun, pileOf, revealTop, topOf, withPiles } from '../engine';
import {
  illegal,
  ok,
  pileKey,
  ref,
  type GameState,
  type KlondikeVariant,
  type Move,
  type PileRef,
  type Result,
  type SolitaireEngine,
  type Variant,
} from '../types';

export interface KlondikeState extends GameState {
  readonly game: 'klondike';
  readonly variant: KlondikeVariant;
}

export const KLONDIKE_DEFAULT: KlondikeVariant = {
  game: 'klondike',
  draw: 1,
  maxRedeals: null,
  scoring: true,
};

const TABLEAUX = 7;
const suitIndex = (suit: Suit): number => SUITS.indexOf(suit);
const foundationRef = (suit: Suit): PileRef => ref('foundation', suitIndex(suit));
const STOCK = ref('stock', 0);
const WASTE = ref('waste', 0);

const asVariant = (variant: Variant): KlondikeVariant =>
  variant.game === 'klondike' ? variant : KLONDIKE_DEFAULT;

export function deal(seed: number, variant: Variant): KlondikeState {
  const v = asVariant(variant);
  const cards = shuffledDeck(seed);
  const piles: Record<string, readonly Card[]> = {
    ...emptyPiles('tableau', TABLEAUX),
    ...emptyPiles('foundation', 4),
    'waste:0': [],
  };

  // Columna i recibe i+1 cartas; sólo la última boca arriba. 28 al tablero, 24 al mazo.
  let cursor = 0;
  for (let column = 0; column < TABLEAUX; column++) {
    const pile: Card[] = [];
    for (let depth = 0; depth <= column; depth++) {
      const card = cards[cursor++] as Card;
      pile.push(flip(card, depth === column));
    }
    piles[pileKey(ref('tableau', column))] = pile;
  }
  piles['stock:0'] = cards.slice(cursor).map((card) => flip(card, false));

  return {
    game: 'klondike',
    variant: v,
    seed,
    piles,
    moveCount: 0,
    redeals: 0,
    score: 0,
  };
}

const foundationAccepts = (foundation: readonly Card[], card: Card, index: number): boolean => {
  if (suitIndex(card.suit) !== index) return false;
  const top = foundation[foundation.length - 1];
  return top ? top.rank === card.rank - 1 : card.rank === 1;
};

const tableauAccepts = (pile: readonly Card[], card: Card): boolean => {
  const top = pile[pile.length - 1];
  if (!top) return card.rank === 13; // Columna vacía: sólo un K (docs/03 §1).
  return top.faceUp && stacksAlternating(card, top);
};

/** Un grupo sólo se mueve si es descendente y de colores alternos, todo boca arriba. */
const movableRun = (pile: readonly Card[], count: number): readonly Card[] | null => {
  if (count < 1 || count > pile.length) return null;
  const run = pile.slice(pile.length - count);
  for (const card of run) if (!card.faceUp) return null;
  for (let i = 1; i < run.length; i++) {
    if (!stacksAlternating(run[i] as Card, run[i - 1] as Card)) return null;
  }
  return run;
};

const cardsMovedFrom = (state: KlondikeState, from: PileRef, count: number): readonly Card[] | null => {
  const pile = pileOf(state, from);
  switch (from.kind) {
    case 'tableau':
      return movableRun(pile, count);
    case 'waste':
    case 'foundation': {
      if (count !== 1) return null;
      const top = pile[pile.length - 1];
      return top ? [top] : null;
    }
    default:
      return null;
  }
};

const scoreDelta = (
  state: KlondikeState,
  from: PileRef,
  to: PileRef,
  revealed: boolean,
): number => {
  if (!state.variant.scoring) return 0;
  let delta = 0;
  if (to.kind === 'foundation') delta += 10;
  if (from.kind === 'waste' && to.kind === 'tableau') delta += 5;
  if (from.kind === 'foundation' && to.kind === 'tableau') delta -= 15;
  if (revealed) delta += 5;
  return delta;
};

export function applyMove(state: KlondikeState, move: Move): Result<KlondikeState> {
  switch (move.kind) {
    case 'draw': {
      const stock = pileOf(state, STOCK);
      if (stock.length === 0) return illegal('El mazo está vacío.');
      const n = Math.min(state.variant.draw, stock.length);
      const drawn = stock.slice(stock.length - n).reverse().map((card) => flip(card, true));
      return ok({
        ...withPiles(state, {
          'stock:0': stock.slice(0, stock.length - n),
          'waste:0': [...pileOf(state, WASTE), ...drawn],
        }),
        moveCount: state.moveCount + 1,
      });
    }

    case 'redeal': {
      if (pileOf(state, STOCK).length > 0) return illegal('Aún quedan cartas en el mazo.');
      const waste = pileOf(state, WASTE);
      if (waste.length === 0) return illegal('No hay cartas que devolver al mazo.');
      const { maxRedeals } = state.variant;
      if (maxRedeals !== null && state.redeals >= maxRedeals) {
        return illegal('No quedan pasadas por el mazo.');
      }
      // Se voltea el montón entero: el orden del descarte se conserva (docs/03 §1).
      const restored = waste
        .slice()
        .reverse()
        .map((card) => flip(card, false));
      const penalty = state.variant.scoring && state.variant.draw === 1 && state.redeals >= 1 ? -100 : 0;
      return ok({
        ...withPiles(state, { 'stock:0': restored, 'waste:0': [] }),
        redeals: state.redeals + 1,
        moveCount: state.moveCount + 1,
        score: Math.max(0, state.score + penalty),
      });
    }

    case 'move': {
      const moved = cardsMovedFrom(state, move.from, move.count);
      if (!moved) return illegal('No se puede mover esa secuencia.');
      const head = moved[0] as Card;
      const target = pileOf(state, move.to);

      if (move.to.kind === 'foundation') {
        if (moved.length !== 1 || !foundationAccepts(target, head, move.to.index)) {
          return illegal('La fundación no acepta esa carta.');
        }
      } else if (move.to.kind === 'tableau') {
        if (!tableauAccepts(target, head)) return illegal('La columna no acepta esa carta.');
      } else {
        return illegal('Destino no válido.');
      }
      if (pileKey(move.from) === pileKey(move.to)) return illegal('Origen y destino coinciden.');

      const source = pileOf(state, move.from);
      const rest = source.slice(0, source.length - moved.length);
      const revealedSource = move.from.kind === 'tableau' ? revealTop(rest) : rest;
      const revealed = revealedSource !== rest;

      return ok({
        ...withPiles(state, {
          [pileKey(move.from)]: revealedSource,
          [pileKey(move.to)]: [...target, ...moved],
        }),
        moveCount: state.moveCount + 1,
        score: Math.max(0, state.score + scoreDelta(state, move.from, move.to, revealed)),
      });
    }

    case 'deal':
    case 'remove':
      return illegal('Movimiento inexistente en Klondike.');
  }
}

export function legalMoves(state: KlondikeState): Move[] {
  const toFoundation: Move[] = [];
  const reveals: Move[] = [];
  const emptying: Move[] = [];
  const fromWaste: Move[] = [];
  const other: Move[] = [];

  const sources: PileRef[] = [WASTE, ...Array.from({ length: TABLEAUX }, (_, i) => ref('tableau', i))];

  for (const from of sources) {
    const pile = pileOf(state, from);
    if (pile.length === 0) continue;

    const top = pile[pile.length - 1] as Card;
    if (top.faceUp) {
      const target = foundationRef(top.suit);
      if (foundationAccepts(pileOf(state, target), top, target.index)) {
        toFoundation.push({ kind: 'move', from, to: target, count: 1 });
      }
    }

    const run = from.kind === 'tableau' ? faceUpRun(pile) : pile.slice(-1);
    const maxCount = from.kind === 'tableau' ? run.length : 1;

    for (let count = 1; count <= maxCount; count++) {
      const moved = cardsMovedFrom(state, from, count);
      if (!moved) continue;
      const head = moved[0] as Card;
      const emptiesSource = from.kind === 'tableau' && count === pile.length;

      for (let column = 0; column < TABLEAUX; column++) {
        const to = ref('tableau', column);
        if (pileKey(to) === pileKey(from)) continue;
        const target = pileOf(state, to);
        if (!tableauAccepts(target, head)) continue;
        // Mover un K de una columna vacía a otra columna vacía no cambia nada.
        if (target.length === 0 && emptiesSource) continue;

        const move: Move = { kind: 'move', from, to, count };
        const revealsCard =
          from.kind === 'tableau' &&
          count < pile.length &&
          !(pile[pile.length - count - 1] as Card).faceUp;

        if (revealsCard) reveals.push(move);
        else if (target.length === 0 && from.kind === 'tableau') emptying.push(move);
        else if (from.kind === 'waste') fromWaste.push(move);
        else other.push(move);
      }
    }
  }

  // De fundación al tablero: legal y a veces necesario, pero nunca es la mejor pista.
  for (const suit of SUITS) {
    const from = foundationRef(suit);
    const top = topOf(state, from);
    if (!top) continue;
    for (let column = 0; column < TABLEAUX; column++) {
      const to = ref('tableau', column);
      if (tableauAccepts(pileOf(state, to), top)) {
        other.push({ kind: 'move', from, to, count: 1 });
      }
    }
  }

  const stockMoves: Move[] = [];
  if (pileOf(state, STOCK).length > 0) {
    stockMoves.push({ kind: 'draw' });
  } else if (pileOf(state, WASTE).length > 0) {
    const { maxRedeals } = state.variant;
    if (maxRedeals === null || state.redeals < maxRedeals) stockMoves.push({ kind: 'redeal' });
  }

  return [...toFoundation, ...reveals, ...emptying, ...fromWaste, ...other, ...stockMoves];
}

export const isWon = (state: KlondikeState): boolean =>
  SUITS.every((suit) => pileOf(state, foundationRef(suit)).length === 13);

/** Un movimiento "real": el que cambia el tablero. Robar y redealar no lo son. */
const hasBoardMove = (state: KlondikeState): boolean =>
  legalMoves(state).some((move) => move.kind === 'move');

/**
 * Atasco: ni ahora ni recorriendo el resto del mazo (con los redeals que queden) aparece un
 * movimiento de tablero. Se simula la pasada en vez de declarar atasco en cuanto no hay nada
 * ahora mismo, que sería mentir con el mazo lleno.
 */
export function isStuck(state: KlondikeState): boolean {
  if (isWon(state)) return false;
  let cursor: KlondikeState = state;
  const seen = new Set<string>();

  for (;;) {
    if (hasBoardMove(cursor)) return false;
    // Sin `redeals` en la huella: con pasadas ilimitadas nunca se repetiría y el bucle no
    // terminaría. Volver al mismo (mazo, descarte) significa haber dado la vuelta en balde.
    const fingerprint = `${pileOf(cursor, STOCK).length}|${pileOf(cursor, WASTE).length}`;
    if (seen.has(fingerprint)) return true;
    seen.add(fingerprint);

    const next =
      pileOf(cursor, STOCK).length > 0
        ? applyMove(cursor, { kind: 'draw' })
        : applyMove(cursor, { kind: 'redeal' });
    if (!next.ok) return true;
    cursor = next.value;
  }
}

/**
 * Subida segura: un valor r sólo sube solo si ambas fundaciones del color contrario están en
 * r−1 o más. Sin esta comprobación el autocompletado agresivo pierde partidas ganables
 * (docs/04 §4, y docs/09 §8 nº 7).
 */
export function isSafeToFoundation(state: KlondikeState, card: Card): boolean {
  if (card.rank <= 2) return true;
  const wanted = colorOf(card.suit) === 'red' ? 'black' : 'red';
  return SUITS.filter((suit) => colorOf(suit) === wanted).every(
    (suit) => pileOf(state, foundationRef(suit)).length >= card.rank - 1,
  );
}

export function autoMove(state: KlondikeState, from: PileRef): Move | null {
  if (from.kind === 'stock') {
    return pileOf(state, STOCK).length > 0 ? { kind: 'draw' } : { kind: 'redeal' };
  }
  const moves = legalMoves(state).filter(
    (move) => move.kind === 'move' && pileKey(move.from) === pileKey(from),
  );
  if (moves.length === 0) return null;

  const top = topOf(state, from);
  const safeFoundation = moves.find(
    (move) =>
      move.kind === 'move' &&
      move.to.kind === 'foundation' &&
      top !== undefined &&
      isSafeToFoundation(state, top),
  );
  if (safeFoundation) return safeFoundation;

  const tableau = moves.find((move) => move.kind === 'move' && move.to.kind === 'tableau');
  if (tableau) return tableau;

  return moves[0] ?? null;
}

export const canAutoFinish = (state: KlondikeState): boolean => {
  if (isWon(state)) return false;
  const hidden = Array.from({ length: TABLEAUX }, (_, i) => pileOf(state, ref('tableau', i))).some(
    (pile) => pile.some((card) => !card.faceUp),
  );
  return !hidden && pileOf(state, STOCK).length === 0 && pileOf(state, WASTE).length === 0;
};

export const score = (state: KlondikeState): number => state.score;

export const rankNeeded = (foundation: readonly Card[]): Rank | null => {
  const top = foundation[foundation.length - 1];
  if (!top) return 1;
  return top.rank === 13 ? null : ((top.rank + 1) as Rank);
};

export const klondike: SolitaireEngine<KlondikeState> = {
  id: 'klondike',
  defaultVariant: KLONDIKE_DEFAULT,
  deal,
  legalMoves,
  applyMove,
  isWon,
  isStuck,
  autoMove,
  score,
  canAutoFinish,
};
