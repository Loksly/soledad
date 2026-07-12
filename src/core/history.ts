import { engineFor } from './games';
import type { GameId, GameState, Move, Variant } from './types';

/**
 * El historial es la lista de MOVIMIENTOS, no de estados (docs/04 §3).
 *
 * Deshacer = retroceder el cursor y reproducir desde el reparto. Con ≤ 200 movimientos y un
 * motor puro cuesta menos de 1 ms, así que no se guardan estados intermedios. Guardar la
 * partida es guardar (juego, variante, semilla, movimientos, cursor): unas decenas de bytes.
 */
export interface Session {
  readonly game: GameId;
  readonly variant: Variant;
  readonly seed: number;
  readonly moves: readonly Move[];
  readonly cursor: number;
  /** Contador acumulado: el reto `noUndo` y el Club de Estrellas necesitan saber si se usó
   *  deshacer *alguna vez*, no si hay cola de rehacer pendiente. */
  readonly undosUsed: number;
  readonly hintsUsed: number;
}

export const newSession = (game: GameId, variant: Variant, seed: number): Session => ({
  game,
  variant,
  seed,
  moves: [],
  cursor: 0,
  undosUsed: 0,
  hintsUsed: 0,
});

/** Reconstruye el estado en el cursor. Es la única forma de obtener un estado: siempre derivado. */
export function replay(session: Session): GameState {
  const engine = engineFor(session.game);
  let state = engine.deal(session.seed, session.variant);
  for (let i = 0; i < session.cursor; i++) {
    const move = session.moves[i];
    if (!move) break;
    const result = engine.applyMove(state, move);
    if (!result.ok) {
      throw new Error(
        `Historial corrupto en el movimiento ${i}: ${result.error.reason}. ` +
          `Partida (${session.game}, semilla ${session.seed}).`,
      );
    }
    state = result.value;
  }
  return state;
}

export const initialState = (session: Session): GameState =>
  engineFor(session.game).deal(session.seed, session.variant);

/** Un movimiento nuevo trunca la cola de rehacer: la línea temporal alternativa desaparece. */
export function push(session: Session, move: Move): Session {
  return {
    ...session,
    moves: [...session.moves.slice(0, session.cursor), move],
    cursor: session.cursor + 1,
  };
}

export const canUndo = (session: Session): boolean => session.cursor > 0;
export const canRedo = (session: Session): boolean => session.cursor < session.moves.length;

export const undo = (session: Session): Session =>
  canUndo(session)
    ? { ...session, cursor: session.cursor - 1, undosUsed: session.undosUsed + 1 }
    : session;

export const redo = (session: Session): Session =>
  canRedo(session) ? { ...session, cursor: session.cursor + 1 } : session;

export const restart = (session: Session): Session => ({
  ...session,
  moves: [],
  cursor: 0,
  undosUsed: 0,
  hintsUsed: 0,
});

export const countHint = (session: Session): Session => ({
  ...session,
  hintsUsed: session.hintsUsed + 1,
});

/** Cuántos movimientos ha hecho el jugador (los deshechos no cuentan). */
export const moveCount = (session: Session): number => session.cursor;

export const usedUndo = (session: Session): boolean => session.undosUsed > 0;
