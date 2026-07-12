import { RANKS, SUITS, makeCard, type Card, type Rank, type Suit } from './card';
import { shuffle, mulberry32 } from './rng';

/** Una baraja de 52, en orden canónico. Sin comodines: no se usan (docs/03 §0). */
export function standardDeck(deckIndex: 0 | 1 = 0): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(makeCard(suit, rank, deckIndex));
    }
  }
  return cards;
}

/**
 * El mazo de Spider: 104 cartas repartidas entre 1, 2 o 4 palos.
 * A 1 palo son 8 barajas de picas; a 2 palos, picas y corazones ×4; a 4 palos, dos barajas.
 * Las 104 cartas deben tener ids únicos, así que el "deck" alterna para los duplicados.
 */
export function spiderDeck(suitCount: 1 | 2 | 4): Card[] {
  const suits: Suit[] =
    suitCount === 1
      ? ['spade']
      : suitCount === 2
        ? ['spade', 'heart']
        : ['spade', 'heart', 'diamond', 'club'];

  const copiesPerSuit = 8 / suits.length;
  const cards: Card[] = [];

  for (const suit of suits) {
    for (let copy = 0; copy < copiesPerSuit; copy++) {
      for (const rank of RANKS) {
        // El id debe ser único entre las 104. Con 8 copias del mismo palo, `deck: 0|1` no basta:
        // se desambigua con el número de copia, que la UI usa como clave de nodo.
        cards.push({
          id: `${suit}-${rank}-${copy}`,
          suit,
          rank,
          deck: (copy % 2) as 0 | 1,
          faceUp: false,
        });
      }
    }
  }
  return cards;
}

export function shuffledDeck(seed: number, deckIndex: 0 | 1 = 0): Card[] {
  return shuffle(standardDeck(deckIndex), mulberry32(seed));
}

export function shuffledSpiderDeck(seed: number, suitCount: 1 | 2 | 4): Card[] {
  return shuffle(spiderDeck(suitCount), mulberry32(seed));
}

export const rankOf = (card: Card): Rank => card.rank;
