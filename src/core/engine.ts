import { flip, type Card } from './card';
import { pileKey, type BaseState, type GameState, type PileRef } from './types';

/**
 * Utilidades comunes a los cinco motores. Todas devuelven estructuras nuevas y comparten por
 * referencia lo que no cambia: la UI puede comparar pilas con `===` para saber qué repintar
 * (docs/04 §6).
 */

export const pileOf = (state: GameState, ref: PileRef): readonly Card[] => {
  const pile = state.piles[pileKey(ref)];
  return pile ?? [];
};

export const topOf = (state: GameState, ref: PileRef): Card | undefined => {
  const pile = pileOf(state, ref);
  return pile[pile.length - 1];
};

export const isEmpty = (state: GameState, ref: PileRef): boolean => pileOf(state, ref).length === 0;

/** Copia estructural: sólo se recrean las pilas tocadas. Nada de structuredClone (docs/04 §6). */
export function withPiles<S extends BaseState>(
  state: S,
  changes: Readonly<Record<string, readonly Card[]>>,
): S {
  return { ...state, piles: { ...state.piles, ...changes } };
}

export function emptyPiles(kind: PileRef['kind'], count: number): Record<string, readonly Card[]> {
  const piles: Record<string, readonly Card[]> = {};
  for (let i = 0; i < count; i++) {
    piles[`${kind}:${i}`] = [];
  }
  return piles;
}

/** Voltea boca arriba la carta que quede al descubierto. Es automático pero forma parte del
 *  movimiento, para que deshacer la devuelva boca abajo (docs/03 §0). */
export function revealTop(pile: readonly Card[]): readonly Card[] {
  const top = pile[pile.length - 1];
  if (!top || top.faceUp) return pile;
  return [...pile.slice(0, -1), flip(top, true)];
}

export function takeFrom(pile: readonly Card[], count: number): [readonly Card[], readonly Card[]] {
  const split = pile.length - count;
  return [pile.slice(0, split), pile.slice(split)];
}

/** Todas las cartas del estado, para las pruebas de conservación. */
export function allCards(state: GameState): Card[] {
  return Object.values(state.piles).flatMap((pile) => [...pile]);
}

export function faceUpRun(pile: readonly Card[]): readonly Card[] {
  let start = pile.length;
  while (start > 0 && (pile[start - 1] as Card).faceUp) start--;
  return pile.slice(start);
}

export const refsOf = (kind: PileRef['kind'], count: number): PileRef[] =>
  Array.from({ length: count }, (_, index) => ({ kind, index }));
