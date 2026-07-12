import { assetName, RANKS, SUITS, type Card } from '../../core/card';
import { asset } from '../../services/base';

/**
 * EL ÚNICO sitio donde se construye una ruta de carta (docs/05 §1).
 *
 * Los nombres reales del repositorio son camelCase con el valor en palabra: `spadeAce`,
 * `club10`, `heartKing`. (docs/ui.md dice `heart_A.svg`: es un error histórico, corregido en
 * docs/05. Los ficheros se listaron antes de escribir esto y `heart_A.svg` no existe.)
 *
 * La extensión es `.webp`, no `.svg`: los SVG originales pesan hasta 744 kB por figura y la
 * precarga obligatoria de las 54 se comía el arranque. Ver scripts/prepare-assets.ts.
 *
 * La ruta es ABSOLUTA. En Capacitor la app se sirve desde https://localhost y una ruta relativa
 * se rompe al navegar: cartas en blanco en el móvil y todo bien en el escritorio (docs/08 §3).
 */

export interface DeckStyle {
  readonly folder: string;
  readonly back: string;
}

export const cardSrc = (card: Card, deck: DeckStyle): string =>
  card.faceUp
    ? asset(`assets/cards/${deck.folder}/${assetName(card.suit, card.rank)}.webp`)
    : backSrc(deck);

export const backSrc = (deck: DeckStyle): string =>
  asset(`assets/cards/${deck.folder}/${deck.back}.webp`);

/**
 * Precarga de las 54 imágenes antes de enseñar el tablero. Un mazo que "aparece por trozos" es
 * inaceptable (docs/05 §1). Se resuelve aunque alguna falle: una carta rota es un defecto
 * visible, pero no puede impedir jugar.
 */
export async function preloadDeck(deck: DeckStyle): Promise<void> {
  const urls = [
    ...SUITS.flatMap((suit) =>
      RANKS.map((rank) => asset(`assets/cards/${deck.folder}/${assetName(suit, rank)}.webp`)),
    ),
    backSrc(deck),
  ];

  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = url;
        }),
    ),
  );
}
