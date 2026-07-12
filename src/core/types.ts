import type { Card } from './card';

export type GameId = 'klondike' | 'spider' | 'freecell' | 'pyramid' | 'tripeaks';

export const GAME_IDS: readonly GameId[] = [
  'klondike',
  'spider',
  'freecell',
  'pyramid',
  'tripeaks',
] as const;

export type PileKind = 'tableau' | 'foundation' | 'stock' | 'waste' | 'free' | 'peaks';

export interface PileRef {
  readonly kind: PileKind;
  readonly index: number;
}

export const pileKey = (ref: PileRef): string => `${ref.kind}:${ref.index}`;
export const ref = (kind: PileKind, index: number): PileRef => ({ kind, index });

/**
 * Variantes por juego. Se guardan en la partida y en el reto diario, así que su forma es
 * parte del formato persistido: añadir campos sí, renombrarlos no.
 */
export interface KlondikeVariant {
  readonly game: 'klondike';
  readonly draw: 1 | 3;
  /** null = pasadas ilimitadas por el mazo. */
  readonly maxRedeals: number | null;
  readonly scoring: boolean;
}

export interface SpiderVariant {
  readonly game: 'spider';
  readonly suits: 1 | 2 | 4;
}

export interface FreecellVariant {
  readonly game: 'freecell';
  readonly freeCells: 1 | 2 | 3 | 4;
}

export interface PyramidVariant {
  readonly game: 'pyramid';
  readonly maxRedeals: number;
  /** El descarte emparejando consigo mismo. Por defecto NO (docs/03 §4). */
  readonly wasteSelfPairing: boolean;
}

export interface TripeaksVariant {
  readonly game: 'tripeaks';
  /** K sobre A y A sobre K. Activado por defecto (docs/03 §5). */
  readonly wrapAround: boolean;
}

export type Variant =
  | KlondikeVariant
  | SpiderVariant
  | FreecellVariant
  | PyramidVariant
  | TripeaksVariant;

export type VariantFor<G extends GameId> = Extract<Variant, { game: G }>;

/**
 * Un movimiento es un dato, no una función. Una partida entera es (semilla, movimientos[]):
 * unos bytes que se guardan, se deshacen y se reproducen para depurar (docs/02 ADR-1).
 */
export type Move =
  | { readonly kind: 'move'; readonly from: PileRef; readonly to: PileRef; readonly count: number }
  | { readonly kind: 'draw' }
  | { readonly kind: 'redeal' }
  | { readonly kind: 'deal' }
  | { readonly kind: 'remove'; readonly piles: readonly PileRef[] };

export interface BaseState {
  readonly game: GameId;
  readonly variant: Variant;
  readonly seed: number;
  readonly piles: Readonly<Record<string, readonly Card[]>>;
  readonly moveCount: number;
  readonly redeals: number;
  readonly score: number;
}

export type GameState = BaseState;

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: IllegalMove };

export interface IllegalMove {
  readonly reason: string;
}

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const illegal = <T>(reason: string): Result<T> => ({ ok: false, error: { reason } });

export const assertNever = (x: never): never => {
  throw new Error(`Caso no cubierto: ${JSON.stringify(x)}`);
};

export interface SolitaireEngine<S extends GameState = GameState> {
  readonly id: GameId;
  readonly defaultVariant: VariantFor<GameId> | Variant;
  deal(seed: number, variant: Variant): S;
  legalMoves(state: S): Move[];
  applyMove(state: S, move: Move): Result<S>;
  isWon(state: S): boolean;
  isStuck(state: S): boolean;
  autoMove(state: S, from: PileRef): Move | null;
  score(state: S): number;
  /** ¿Se puede terminar sola? (nada boca abajo y todo ordenado). */
  canAutoFinish(state: S): boolean;
}
