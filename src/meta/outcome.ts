import { pileOf } from '../core/engine';
import { engineFor } from '../core/games';
import { ref, type GameId, type GameState, type Variant } from '../core/types';
import type { Objective } from './daily';

/**
 * Lo que la capa de recompensas necesita saber de una partida terminada. Se deriva del estado
 * final del motor, así que no hay forma de "reportar" un resultado falso desde la interfaz.
 */
export interface Outcome {
  readonly game: GameId;
  readonly variant: Variant;
  readonly seed: number;
  readonly won: boolean;
  readonly moves: number;
  readonly seconds: number;
  readonly score: number;
  readonly undosUsed: number;
  readonly hintsUsed: number;
  readonly foundations: number;
  readonly freeCellsUsed: number;
  readonly bestChain: number;
  readonly stockDeals: number;
}

const foundationCount = (state: GameState): number => {
  let complete = 0;
  for (const [key, pile] of Object.entries(state.piles)) {
    if (!key.startsWith('foundation:')) continue;
    if (state.game === 'spider') {
      if (pile.length === 13) complete++;
    } else if (state.game === 'klondike' || state.game === 'freecell') {
      if (pile.length > 0) complete++;
    }
  }
  return complete;
};

export function outcomeOf(
  state: GameState,
  extras: {
    readonly seconds: number;
    readonly undosUsed: number;
    readonly hintsUsed: number;
    readonly freeCellsUsed: number;
    readonly bestChain: number;
    readonly stockDeals: number;
  },
): Outcome {
  const engine = engineFor(state.game);
  return {
    game: state.game,
    variant: state.variant,
    seed: state.seed,
    won: engine.isWon(state),
    moves: state.moveCount,
    seconds: extras.seconds,
    score: engine.score(state),
    undosUsed: extras.undosUsed,
    hintsUsed: extras.hintsUsed,
    foundations: foundationCount(state),
    freeCellsUsed: extras.freeCellsUsed,
    bestChain: extras.bestChain,
    stockDeals: extras.stockDeals,
  };
}

/** Cuántas celdas libres se están usando ahora mismo (FreeCell). */
export const freeCellsInUse = (state: GameState): number => {
  let used = 0;
  for (let i = 0; i < 4; i++) {
    if (pileOf(state, ref('free', i)).length > 0) used++;
  }
  return used;
};

/** ¿Se cumplió el objetivo del reto? Un objetivo parcial se puede cumplir sin ganar. */
export function meetsObjective(objective: Objective, outcome: Outcome): boolean {
  switch (objective.kind) {
    case 'win':
      return outcome.won;
    case 'winUnder':
      return outcome.won && outcome.moves <= objective.moves;
    case 'winWithin':
      return outcome.won && outcome.seconds <= objective.seconds;
    case 'score':
      return outcome.score >= objective.min;
    case 'foundations':
      return outcome.foundations >= objective.count;
    case 'noUndo':
      return outcome.won && outcome.undosUsed === 0;
    case 'freecellsUnused':
      return outcome.won && outcome.freeCellsUsed <= objective.max;
  }
}

export function describeObjective(objective: Objective): { key: string; value: number } {
  switch (objective.kind) {
    case 'win':
      return { key: 'objective.win', value: 0 };
    case 'winUnder':
      return { key: 'objective.winUnder', value: objective.moves };
    case 'winWithin':
      return { key: 'objective.winWithin', value: Math.round(objective.seconds / 60) };
    case 'score':
      return { key: 'objective.score', value: objective.min };
    case 'foundations':
      return { key: 'objective.foundations', value: objective.count };
    case 'noUndo':
      return { key: 'objective.noUndo', value: 0 };
    case 'freecellsUnused':
      return { key: 'objective.freecellsUnused', value: objective.max };
  }
}
