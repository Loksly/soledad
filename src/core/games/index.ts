import { freecell, FREECELL_DEFAULT } from './freecell';
import { klondike, KLONDIKE_DEFAULT } from './klondike';
import { pyramid, PYRAMID_DEFAULT } from './pyramid';
import { spider, SPIDER_DEFAULT } from './spider';
import { tripeaks, TRIPEAKS_DEFAULT } from './tripeaks';
import type { GameId, GameState, SolitaireEngine, Variant } from '../types';

export type { KlondikeState } from './klondike';
export type { FreecellState } from './freecell';
export type { SpiderState } from './spider';
export type { PyramidState } from './pyramid';
export type { TripeaksState } from './tripeaks';

export { klondike, spider, freecell, pyramid, tripeaks };
export { maxMovable } from './freecell';
export { isSafeToFoundation as isSafeKlondike } from './klondike';

/**
 * Añadir un sexto solitario es añadir un fichero aquí y registrarlo. Cero cambios en la UI,
 * en la persistencia o en las recompensas: esa es la prueba de fuego de la arquitectura
 * (docs/02 ADR-3).
 */
const REGISTRY: Readonly<Record<GameId, SolitaireEngine<GameState>>> = {
  klondike,
  spider,
  freecell,
  pyramid,
  tripeaks,
};

export const engineFor = (game: GameId): SolitaireEngine<GameState> => REGISTRY[game];

export const DEFAULT_VARIANTS: Readonly<Record<GameId, Variant>> = {
  klondike: KLONDIKE_DEFAULT,
  spider: SPIDER_DEFAULT,
  freecell: FREECELL_DEFAULT,
  pyramid: PYRAMID_DEFAULT,
  tripeaks: TRIPEAKS_DEFAULT,
};

export { KLONDIKE_DEFAULT, SPIDER_DEFAULT, FREECELL_DEFAULT, PYRAMID_DEFAULT, TRIPEAKS_DEFAULT };

/** Todas las variantes ofrecidas en "partida libre", en el orden en que se muestran. */
export const VARIANTS_OF: Readonly<Record<GameId, readonly Variant[]>> = {
  klondike: [
    { game: 'klondike', draw: 1, maxRedeals: null, scoring: true },
    { game: 'klondike', draw: 3, maxRedeals: null, scoring: true },
    { game: 'klondike', draw: 3, maxRedeals: 2, scoring: true },
  ],
  spider: [
    { game: 'spider', suits: 1 },
    { game: 'spider', suits: 2 },
    { game: 'spider', suits: 4 },
  ],
  freecell: [
    { game: 'freecell', freeCells: 4 },
    { game: 'freecell', freeCells: 2 },
  ],
  pyramid: [
    { game: 'pyramid', maxRedeals: 2, wasteSelfPairing: false },
    { game: 'pyramid', maxRedeals: 0, wasteSelfPairing: false },
  ],
  tripeaks: [
    { game: 'tripeaks', wrapAround: true },
    { game: 'tripeaks', wrapAround: false },
  ],
};
