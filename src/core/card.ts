export type Suit = 'spade' | 'heart' | 'diamond' | 'club';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Color = 'red' | 'black';

/**
 * `id` es obligatorio, no decorativo: en Spider hay dos barajas y sin él la UI no puede
 * distinguir dos 7♠ idénticos, así que Preact recicla el nodo equivocado y la animación
 * de movimiento se rompe (docs/04 §1).
 */
export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: Rank;
  readonly deck: 0 | 1;
  readonly faceUp: boolean;
}

export const SUITS: readonly Suit[] = ['spade', 'heart', 'diamond', 'club'] as const;
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export const colorOf = (suit: Suit): Color =>
  suit === 'heart' || suit === 'diamond' ? 'red' : 'black';

export const cardId = (suit: Suit, rank: Rank, deck: 0 | 1): string => `${suit}-${rank}-${deck}`;

export const makeCard = (suit: Suit, rank: Rank, deck: 0 | 1 = 0, faceUp = false): Card => ({
  id: cardId(suit, rank, deck),
  suit,
  rank,
  deck,
  faceUp,
});

export const flip = (card: Card, faceUp: boolean): Card =>
  card.faceUp === faceUp ? card : { ...card, faceUp };

export const isRed = (card: Card): boolean => colorOf(card.suit) === 'red';
export const sameColor = (a: Card, b: Card): boolean => colorOf(a.suit) === colorOf(b.suit);
export const alternates = (a: Card, b: Card): boolean => !sameColor(a, b);

/** Descendente y de colores alternos: la secuencia de Klondike y FreeCell. */
export const stacksAlternating = (upper: Card, lower: Card): boolean =>
  alternates(upper, lower) && upper.rank === lower.rank - 1;

/** Descendente y del mismo palo: la secuencia *movible* de Spider. */
export const stacksSameSuit = (upper: Card, lower: Card): boolean =>
  upper.suit === lower.suit && upper.rank === lower.rank - 1;

const RANK_LABEL: Record<Rank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export const rankLabel = (rank: Rank): string => RANK_LABEL[rank];

/** Nombre del fichero SVG: camelCase con el valor en palabra (spadeAce, club10, heartKing). */
const RANK_ASSET_NAME: Record<Rank, string> = {
  1: 'Ace',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
};

export const assetName = (suit: Suit, rank: Rank): string => `${suit}${RANK_ASSET_NAME[rank]}`;
