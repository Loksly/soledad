import type { GameId } from '../core/types';
import type { Outcome } from './outcome';

/**
 * Club de Estrellas (docs/06 §5): objetivos de largo recorrido que dan objetivo a quien ya hizo
 * los retos del día. Se progresa jugando CUALQUIER partida, libre o diaria. Nunca requieren
 * conectividad. Nunca dan ventaja de juego: sólo estrellas, insignias y monedas para cosmética.
 */

export interface StarObjective {
  readonly id: string;
  readonly game: GameId;
  readonly collection: string;
  /** Cuántas veces hay que cumplirlo. La mayoría son 1; algunos piden repetición. */
  readonly times: number;
  readonly coins: number;
  readonly test: (outcome: Outcome) => boolean;
}

const won = (outcome: Outcome): boolean => outcome.won;

export const STAR_OBJECTIVES: readonly StarObjective[] = [
  // Klondike
  {
    id: 'klondike.draw3.wins',
    game: 'klondike',
    collection: 'klondike.basics',
    times: 3,
    coins: 40,
    test: (o) => won(o) && o.variant.game === 'klondike' && o.variant.draw === 3,
  },
  {
    id: 'klondike.noUndo',
    game: 'klondike',
    collection: 'klondike.basics',
    times: 1,
    coins: 50,
    test: (o) => won(o) && o.undosUsed === 0,
  },
  {
    id: 'klondike.under6min',
    game: 'klondike',
    collection: 'klondike.mastery',
    times: 1,
    coins: 60,
    test: (o) => won(o) && o.seconds <= 360,
  },

  // Spider
  {
    id: 'spider.noDeal',
    game: 'spider',
    collection: 'spider.basics',
    times: 1,
    coins: 40,
    test: (o) => o.foundations >= 1 && o.stockDeals === 0,
  },
  {
    id: 'spider.win2suits',
    game: 'spider',
    collection: 'spider.mastery',
    times: 1,
    coins: 75,
    test: (o) => won(o) && o.variant.game === 'spider' && o.variant.suits === 2,
  },
  {
    id: 'spider.win4suits',
    game: 'spider',
    collection: 'spider.mastery',
    times: 1,
    coins: 100,
    test: (o) => won(o) && o.variant.game === 'spider' && o.variant.suits === 4,
  },

  // FreeCell
  {
    id: 'freecell.noCells',
    game: 'freecell',
    collection: 'freecell.mastery',
    times: 1,
    coins: 100,
    test: (o) => won(o) && o.freeCellsUsed === 0,
  },
  {
    id: 'freecell.under60moves',
    game: 'freecell',
    collection: 'freecell.mastery',
    times: 1,
    coins: 75,
    test: (o) => won(o) && o.moves <= 60,
  },

  // Pirámide
  {
    id: 'pyramid.oneRedeal',
    game: 'pyramid',
    collection: 'pyramid.basics',
    times: 1,
    coins: 60,
    test: (o) => won(o) && o.stockDeals <= 1,
  },
  {
    id: 'pyramid.wins',
    game: 'pyramid',
    collection: 'pyramid.basics',
    times: 3,
    coins: 45,
    test: won,
  },

  // TriPeaks
  {
    id: 'tripeaks.chain10',
    game: 'tripeaks',
    collection: 'tripeaks.basics',
    times: 1,
    coins: 50,
    test: (o) => o.bestChain >= 10,
  },
  {
    id: 'tripeaks.clearAll',
    game: 'tripeaks',
    collection: 'tripeaks.mastery',
    times: 1,
    coins: 75,
    test: won,
  },
];

export type StarProgress = Readonly<Record<string, number>>;

export interface StarResult {
  readonly progress: StarProgress;
  readonly completed: readonly StarObjective[];
  readonly coins: number;
}

/** Avanza los objetivos que esta partida cumple. Nunca retrocede: el progreso no se pierde. */
export function advance(progress: StarProgress, outcome: Outcome): StarResult {
  const next: Record<string, number> = { ...progress };
  const completed: StarObjective[] = [];
  let coins = 0;

  for (const objective of STAR_OBJECTIVES) {
    if (objective.game !== outcome.game) continue;
    const before = next[objective.id] ?? 0;
    if (before >= objective.times) continue;
    if (!objective.test(outcome)) continue;

    const after = before + 1;
    next[objective.id] = after;
    if (after >= objective.times) {
      completed.push(objective);
      coins += objective.coins;
    }
  }
  return { progress: next, completed, coins };
}

export const starsEarned = (progress: StarProgress): number =>
  STAR_OBJECTIVES.filter((objective) => (progress[objective.id] ?? 0) >= objective.times).length;

export const collections = (): readonly string[] => [
  ...new Set(STAR_OBJECTIVES.map((objective) => objective.collection)),
];

export const collectionComplete = (progress: StarProgress, collection: string): boolean =>
  STAR_OBJECTIVES.filter((objective) => objective.collection === collection).every(
    (objective) => (progress[objective.id] ?? 0) >= objective.times,
  );
