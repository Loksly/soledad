import { SUITS, colorOf, stacksAlternating, flip, type Card, type Suit } from '../card';
import { shuffledDeck } from '../deck';
import { emptyPiles, isEmpty, pileOf, topOf, withPiles } from '../engine';
import {
  illegal,
  ok,
  pileKey,
  ref,
  type FreecellVariant,
  type GameState,
  type Move,
  type PileRef,
  type Result,
  type SolitaireEngine,
  type Variant,
} from '../types';

export interface FreecellState extends GameState {
  readonly game: 'freecell';
  readonly variant: FreecellVariant;
}

export const FREECELL_DEFAULT: FreecellVariant = { game: 'freecell', freeCells: 4 };

const TABLEAUX = 8;
const suitIndex = (suit: Suit): number => SUITS.indexOf(suit);
const foundationRef = (suit: Suit): PileRef => ref('foundation', suitIndex(suit));

const asVariant = (variant: Variant): FreecellVariant =>
  variant.game === 'freecell' ? variant : FREECELL_DEFAULT;

export function deal(seed: number, variant: Variant): FreecellState {
  const v = asVariant(variant);
  const cards = shuffledDeck(seed).map((card) => flip(card, true)); // Todo boca arriba.
  const piles: Record<string, readonly Card[]> = {
    ...emptyPiles('tableau', TABLEAUX),
    ...emptyPiles('foundation', 4),
    ...emptyPiles('free', v.freeCells),
  };

  // Columnas 1–4: 7 cartas. Columnas 5–8: 6 cartas. 4·7 + 4·6 = 52.
  let cursor = 0;
  for (let column = 0; column < TABLEAUX; column++) {
    const size = column < 4 ? 7 : 6;
    piles[pileKey(ref('tableau', column))] = cards.slice(cursor, cursor + size);
    cursor += size;
  }

  return { game: 'freecell', variant: v, seed, piles, moveCount: 0, redeals: 0, score: 0 };
}

const freeCellCount = (state: FreecellState): number => {
  let free = 0;
  for (let i = 0; i < state.variant.freeCells; i++) {
    if (isEmpty(state, ref('free', i))) free++;
  }
  return free;
};

const emptyColumns = (state: FreecellState): number => {
  let empty = 0;
  for (let i = 0; i < TABLEAUX; i++) {
    if (isEmpty(state, ref('tableau', i))) empty++;
  }
  return empty;
};

/**
 * (celdas_libres + 1) × 2 ^ (columnas_vacías), y si el DESTINO es una columna vacía, esa
 * columna no se cuenta a sí misma: no puedes usar como escalón el sitio donde vas a dejar
 * las cartas (docs/03 §3). Es la regla que más se implementa mal.
 */
export function maxMovable(state: FreecellState, destination?: PileRef): number {
  const free = freeCellCount(state);
  let empties = emptyColumns(state);
  if (destination?.kind === 'tableau' && isEmpty(state, destination)) empties -= 1;
  return (free + 1) * Math.pow(2, Math.max(0, empties));
}

const isAlternatingRun = (run: readonly Card[]): boolean => {
  for (let i = 1; i < run.length; i++) {
    if (!stacksAlternating(run[i] as Card, run[i - 1] as Card)) return false;
  }
  return true;
};

const foundationAccepts = (foundation: readonly Card[], card: Card, index: number): boolean => {
  if (suitIndex(card.suit) !== index) return false;
  const top = foundation[foundation.length - 1];
  return top ? top.rank === card.rank - 1 : card.rank === 1;
};

const tableauAccepts = (pile: readonly Card[], card: Card): boolean => {
  const top = pile[pile.length - 1];
  return top ? stacksAlternating(card, top) : true; // Columna vacía: cualquier carta.
};

const movedCards = (state: FreecellState, from: PileRef, count: number): readonly Card[] | null => {
  const pile = pileOf(state, from);
  if (count < 1 || count > pile.length) return null;
  if (from.kind === 'free' || from.kind === 'foundation') {
    return count === 1 ? pile.slice(-1) : null;
  }
  if (from.kind !== 'tableau') return null;
  const run = pile.slice(pile.length - count);
  return isAlternatingRun(run) ? run : null;
};

export function applyMove(state: FreecellState, move: Move): Result<FreecellState> {
  switch (move.kind) {
    case 'move': {
      const moved = movedCards(state, move.from, move.count);
      if (!moved) return illegal('Esa secuencia no es descendente de colores alternos.');
      if (pileKey(move.from) === pileKey(move.to)) return illegal('Origen y destino coinciden.');

      const head = moved[0] as Card;
      const target = pileOf(state, move.to);

      switch (move.to.kind) {
        case 'foundation':
          if (moved.length !== 1 || !foundationAccepts(target, head, move.to.index)) {
            return illegal('La fundación no acepta esa carta.');
          }
          break;
        case 'free':
          if (moved.length !== 1 || target.length > 0) return illegal('La celda no está libre.');
          break;
        case 'tableau': {
          if (!tableauAccepts(target, head)) return illegal('La columna no acepta esa carta.');
          // El supermovimiento es azúcar de interfaz sobre movimientos de una carta: si no
          // caben, es ilegal aunque la secuencia sea válida.
          if (moved.length > maxMovable(state, move.to)) {
            return illegal('No hay suficientes celdas libres ni columnas vacías.');
          }
          break;
        }
        default:
          return illegal('Destino no válido.');
      }

      const source = pileOf(state, move.from);
      return ok({
        ...withPiles(state, {
          [pileKey(move.from)]: source.slice(0, source.length - moved.length),
          [pileKey(move.to)]: [...target, ...moved],
        }),
        moveCount: state.moveCount + 1,
        score: state.score + (move.to.kind === 'foundation' ? 10 : 0),
      });
    }

    case 'draw':
    case 'redeal':
    case 'deal':
    case 'remove':
      return illegal('Movimiento inexistente en FreeCell.');
  }
}

export function legalMoves(state: FreecellState): Move[] {
  const toFoundation: Move[] = [];
  const outOfCell: Move[] = [];
  const onTableau: Move[] = [];
  const toEmpty: Move[] = [];
  const intoCell: Move[] = [];

  const cells = Array.from({ length: state.variant.freeCells }, (_, i) => ref('free', i));
  const columns = Array.from({ length: TABLEAUX }, (_, i) => ref('tableau', i));

  const push = (from: PileRef, to: PileRef, count: number): void => {
    const move: Move = { kind: 'move', from, to, count };
    if (to.kind === 'foundation') toFoundation.push(move);
    else if (to.kind === 'free') intoCell.push(move);
    else if (isEmpty(state, to)) toEmpty.push(move);
    else if (from.kind === 'free') outOfCell.push(move);
    else onTableau.push(move);
  };

  for (const from of [...columns, ...cells]) {
    const pile = pileOf(state, from);
    if (pile.length === 0) continue;

    const top = pile[pile.length - 1] as Card;
    const foundation = foundationRef(top.suit);
    if (foundationAccepts(pileOf(state, foundation), top, foundation.index)) {
      push(from, foundation, 1);
    }

    const maxRun = from.kind === 'free' ? 1 : Math.min(pile.length, 13);
    for (let count = 1; count <= maxRun; count++) {
      const moved = movedCards(state, from, count);
      if (!moved) break; // Las secuencias más largas tampoco serán válidas.
      const head = moved[0] as Card;
      const emptiesSource = from.kind === 'tableau' && count === pile.length;

      for (const to of columns) {
        if (pileKey(to) === pileKey(from)) continue;
        if (!tableauAccepts(pileOf(state, to), head)) continue;
        if (count > maxMovable(state, to)) continue;
        if (isEmpty(state, to) && emptiesSource) continue; // Mover una columna a otra vacía no aporta.
        push(from, to, count);
      }
    }

    if (from.kind === 'tableau') {
      const cell = cells.find((c) => isEmpty(state, c));
      if (cell) push(from, cell, 1);
    }
  }

  // Ordenadas por calidad: fundación > salir de celda > tablero > vaciar > entrar en celda.
  return [...toFoundation, ...outOfCell, ...onTableau, ...toEmpty, ...intoCell];
}

export const isWon = (state: FreecellState): boolean =>
  SUITS.every((suit) => pileOf(state, foundationRef(suit)).length === 13);

export const isStuck = (state: FreecellState): boolean =>
  !isWon(state) && legalMoves(state).length === 0;

export function isSafeToFoundation(state: FreecellState, card: Card): boolean {
  if (card.rank <= 2) return true;
  const wanted = colorOf(card.suit) === 'red' ? 'black' : 'red';
  return SUITS.filter((suit) => colorOf(suit) === wanted).every(
    (suit) => pileOf(state, foundationRef(suit)).length >= card.rank - 1,
  );
}

export function autoMove(state: FreecellState, from: PileRef): Move | null {
  const moves = legalMoves(state).filter(
    (move) => move.kind === 'move' && pileKey(move.from) === pileKey(from),
  );
  if (moves.length === 0) return null;
  const top = topOf(state, from);

  const safe = moves.find(
    (move) =>
      move.kind === 'move' &&
      move.to.kind === 'foundation' &&
      top !== undefined &&
      isSafeToFoundation(state, top),
  );
  if (safe) return safe;

  const tableau = moves.find((move) => move.kind === 'move' && move.to.kind === 'tableau');
  if (tableau) return tableau;

  return moves[0] ?? null;
}

/**
 * Basta con que cada columna esté en orden de valor descendente (sin importar el palo): así,
 * el As que toque siempre está accesible o sólo tiene cartas de valor menor encima, que ya
 * habrán subido antes. Exigir además colores alternos sería más estricto de lo necesario y
 * escondería el botón "Terminar" en partidas ya ganadas.
 */
export const canAutoFinish = (state: FreecellState): boolean => {
  if (isWon(state)) return false;
  for (let i = 0; i < TABLEAUX; i++) {
    const pile = pileOf(state, ref('tableau', i));
    for (let j = 1; j < pile.length; j++) {
      if ((pile[j] as Card).rank >= (pile[j - 1] as Card).rank) return false;
    }
  }
  return true;
};

export const score = (state: FreecellState): number => state.score;

export const freecell: SolitaireEngine<FreecellState> = {
  id: 'freecell',
  defaultVariant: FREECELL_DEFAULT,
  deal,
  legalMoves,
  applyMove,
  isWon,
  isStuck,
  autoMove,
  score,
  canAutoFinish,
};
