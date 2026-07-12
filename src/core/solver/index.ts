import { engineFor } from '../games';
import type { GameId, Move, Variant } from '../types';
import { classify, solve, type Difficulty, type SolveResult } from './generic';

export { canonical, solve, classify } from './generic';
export type { SolveResult, SolveOptions, Difficulty } from './generic';

/** Presupuesto por juego. Klondike y Spider son los caros; el resto se resuelve en ms. */
const BUDGET: Readonly<Record<GameId, number>> = {
  freecell: 150_000,
  klondike: 400_000,
  pyramid: 250_000,
  tripeaks: 120_000,
  spider: 300_000,
};

export interface Verdict {
  readonly solvable: boolean;
  readonly verified: boolean; // ¿lo hemos demostrado, o sólo no hemos encontrado solución?
  readonly difficulty: Difficulty;
  readonly minMoves: number;
  readonly nodes: number;
}

/**
 * Spider a 4 palos es demasiado duro para exigir resolución demostrada (docs/04 §5). En su
 * lugar se hace una partida golosa y se mide cuánto avanza: un reparto que ni siquiera deja
 * completar una secuencia jugando bien es un muro, y no se ofrece como reto.
 */
export function greedyPlayout(game: GameId, variant: Variant, seed: number): number {
  const engine = engineFor(game);
  let state = engine.deal(seed, variant);
  const seen = new Set<string>();

  for (let step = 0; step < 2_000; step++) {
    if (engine.isWon(state)) return 1;
    const moves: Move[] = engine.legalMoves(state);
    if (moves.length === 0) break;

    let advanced = false;
    for (const move of moves) {
      const result = engine.applyMove(state, move);
      if (!result.ok) continue;
      const key = JSON.stringify(result.value.piles);
      if (seen.has(key)) continue;
      seen.add(key);
      state = result.value;
      advanced = true;
      break;
    }
    if (!advanced) break;
  }

  const engineProgress = engine.score(state);
  const foundations = Object.entries(state.piles).filter(
    ([key, pile]) => key.startsWith('foundation') && pile.length > 0,
  ).length;
  return Math.min(1, foundations / 8 + (engineProgress > 500 ? 0.1 : 0));
}

export function analyse(game: GameId, variant: Variant, seed: number): Verdict {
  if (game === 'spider' && variant.game === 'spider' && variant.suits === 4) {
    const progress = greedyPlayout(game, variant, seed);
    return {
      solvable: progress > 0,
      verified: false,
      difficulty: 'expert',
      minMoves: 0,
      nodes: 0,
    };
  }

  const result: SolveResult = solve(game, variant, seed, { maxNodes: BUDGET[game] });
  return {
    solvable: result.solved,
    verified: result.solved || !result.exhausted,
    difficulty: classify(result),
    minMoves: result.moves.length,
    nodes: result.nodes,
  };
}
