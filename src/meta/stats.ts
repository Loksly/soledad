import { GAME_IDS, type GameId, type Variant } from '../core/types';
import type { Outcome } from './outcome';

export interface GameStats {
  readonly played: number;
  readonly won: number;
  readonly bestTime: number | null;
  readonly fewestMoves: number | null;
  readonly bestScore: number;
  readonly currentWinStreak: number;
  readonly bestWinStreak: number;
  readonly totalSeconds: number;
}

export type StatsByGame = Record<string, GameStats>;

export const emptyGameStats = (): GameStats => ({
  played: 0,
  won: 0,
  bestTime: null,
  fewestMoves: null,
  bestScore: 0,
  currentWinStreak: 0,
  bestWinStreak: 0,
  totalSeconds: 0,
});

/** Clave por juego Y variante: ganar a Spider de 1 palo no dice nada de tu nivel a 4 palos. */
export const statsKey = (game: GameId, variant: Variant): string => {
  switch (variant.game) {
    case 'klondike':
      return `klondike:draw${variant.draw}`;
    case 'spider':
      return `spider:${variant.suits}`;
    case 'freecell':
      return `freecell:${variant.freeCells}`;
    case 'pyramid':
      return `pyramid:${variant.maxRedeals}`;
    case 'tripeaks':
      return `tripeaks:${variant.wrapAround ? 'wrap' : 'strict'}`;
    default:
      return game;
  }
};

export const emptyStats = (): StatsByGame => ({});

export function record(stats: StatsByGame, outcome: Outcome): StatsByGame {
  const key = statsKey(outcome.game, outcome.variant);
  const before = stats[key] ?? emptyGameStats();

  const winStreak = outcome.won ? before.currentWinStreak + 1 : 0;
  const next: GameStats = {
    played: before.played + 1,
    won: before.won + (outcome.won ? 1 : 0),
    bestTime: outcome.won
      ? before.bestTime === null
        ? outcome.seconds
        : Math.min(before.bestTime, outcome.seconds)
      : before.bestTime,
    fewestMoves: outcome.won
      ? before.fewestMoves === null
        ? outcome.moves
        : Math.min(before.fewestMoves, outcome.moves)
      : before.fewestMoves,
    bestScore: Math.max(before.bestScore, outcome.score),
    currentWinStreak: winStreak,
    bestWinStreak: Math.max(before.bestWinStreak, winStreak),
    totalSeconds: before.totalSeconds + outcome.seconds,
  };
  return { ...stats, [key]: next };
}

export const winRate = (stats: GameStats): number =>
  stats.played === 0 ? 0 : stats.won / stats.played;

/** Resumen por juego, sumando sus variantes: es lo que se enseña en la pantalla principal. */
export function summaryFor(stats: StatsByGame, game: GameId): GameStats {
  const relevant = Object.entries(stats).filter(([key]) => key.startsWith(`${game}:`));
  return relevant.reduce<GameStats>((sum, [, entry]) => {
    const bestTime =
      entry.bestTime === null
        ? sum.bestTime
        : sum.bestTime === null
          ? entry.bestTime
          : Math.min(sum.bestTime, entry.bestTime);
    const fewestMoves =
      entry.fewestMoves === null
        ? sum.fewestMoves
        : sum.fewestMoves === null
          ? entry.fewestMoves
          : Math.min(sum.fewestMoves, entry.fewestMoves);
    return {
      played: sum.played + entry.played,
      won: sum.won + entry.won,
      bestTime,
      fewestMoves,
      bestScore: Math.max(sum.bestScore, entry.bestScore),
      currentWinStreak: Math.max(sum.currentWinStreak, entry.currentWinStreak),
      bestWinStreak: Math.max(sum.bestWinStreak, entry.bestWinStreak),
      totalSeconds: sum.totalSeconds + entry.totalSeconds,
    };
  }, emptyGameStats());
}

export const totals = (stats: StatsByGame): GameStats =>
  GAME_IDS.map((game) => summaryFor(stats, game)).reduce<GameStats>(
    (sum, entry) => ({
      played: sum.played + entry.played,
      won: sum.won + entry.won,
      bestTime: null,
      fewestMoves: null,
      bestScore: Math.max(sum.bestScore, entry.bestScore),
      currentWinStreak: 0,
      bestWinStreak: Math.max(sum.bestWinStreak, entry.bestWinStreak),
      totalSeconds: sum.totalSeconds + entry.totalSeconds,
    }),
    emptyGameStats(),
  );

/**
 * FUSIÓN de dos dispositivos (docs/07 §4): por MÁXIMO, nunca "el último gana". Perderle a
 * alguien su mejor tiempo por sincronizar sería imperdonable; que las partidas jugadas se
 * cuenten de más, en cambio, no le hace daño a nadie: no hay ranking.
 */
export function merge(a: StatsByGame, b: StatsByGame): StatsByGame {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: StatsByGame = {};

  for (const key of keys) {
    const left = a[key] ?? emptyGameStats();
    const right = b[key] ?? emptyGameStats();
    const bestTime =
      left.bestTime === null
        ? right.bestTime
        : right.bestTime === null
          ? left.bestTime
          : Math.min(left.bestTime, right.bestTime);
    const fewestMoves =
      left.fewestMoves === null
        ? right.fewestMoves
        : right.fewestMoves === null
          ? left.fewestMoves
          : Math.min(left.fewestMoves, right.fewestMoves);

    out[key] = {
      played: Math.max(left.played, right.played),
      won: Math.max(left.won, right.won),
      bestTime,
      fewestMoves,
      bestScore: Math.max(left.bestScore, right.bestScore),
      currentWinStreak: Math.max(left.currentWinStreak, right.currentWinStreak),
      bestWinStreak: Math.max(left.bestWinStreak, right.bestWinStreak),
      totalSeconds: Math.max(left.totalSeconds, right.totalSeconds),
    };
  }
  return out;
}
