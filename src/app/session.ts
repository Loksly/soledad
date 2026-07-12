import { batch, computed, signal } from '@preact/signals';
import { engineFor } from '../core/games';
import {
  canRedo,
  canUndo,
  countHint,
  moveCount,
  newSession,
  push,
  redo,
  replay,
  restart,
  undo,
  type Session,
} from '../core/history';
import { pileOf } from '../core/engine';
import { ref, type GameId, type GameState, type Move, type PileRef, type Variant } from '../core/types';
import { freeCellsInUse, outcomeOf, type Outcome } from '../meta/outcome';
import type { DailyChallenge } from '../meta/daily';
import type { Clock } from '../services/clock';

/**
 * La sesión de partida. La UI no toca el motor directamente: pide movimientos aquí, y aquí se
 * mantiene el historial, el cronómetro y las estadísticas derivadas de la partida en curso.
 *
 * Nunca se serializa el tablero: una partida guardada es (juego, variante, semilla,
 * movimientos, cursor). Reanudar es reproducir (docs/04 §3).
 */

export interface GameSession {
  readonly session: Session;
  readonly challenge: DailyChallenge | null;
  readonly seconds: number;
  readonly freeCellsPeak: number;
  readonly bestChain: number;
  readonly stockDeals: number;
}

export const session = signal<Session | null>(null);
export const challenge = signal<DailyChallenge | null>(null);
export const seconds = signal(0);
export const freeCellsPeak = signal(0);
export const bestChain = signal(0);
export const stockDeals = signal(0);
export const hint = signal<Move | null>(null);
export const lastMove = signal<Move | null>(null);

/** El estado del tablero es SIEMPRE derivado del historial. Nunca hay una copia que mantener. */
export const state = computed<GameState | null>(() => {
  const current = session.value;
  return current ? replay(current) : null;
});

export const engine = computed(() => {
  const current = session.value;
  return current ? engineFor(current.game) : null;
});

export const isWon = computed(() => {
  const board = state.value;
  return board ? engineFor(board.game).isWon(board) : false;
});

export const isStuck = computed(() => {
  const board = state.value;
  if (!board || isWon.value) return false;
  return engineFor(board.game).isStuck(board);
});

export const canFinish = computed(() => {
  const board = state.value;
  return board ? engineFor(board.game).canAutoFinish(board) : false;
});

export const undoAvailable = computed(() => (session.value ? canUndo(session.value) : false));
export const redoAvailable = computed(() => (session.value ? canRedo(session.value) : false));
export const moves = computed(() => (session.value ? moveCount(session.value) : 0));

let timer: ReturnType<typeof setInterval> | null = null;
let clock: Clock | null = null;

export function attachClock(injected: Clock): void {
  clock = injected;
}

export function start(game: GameId, variant: Variant, seed: number, daily: DailyChallenge | null = null): void {
  batch(() => {
    session.value = newSession(game, variant, seed);
    challenge.value = daily;
    seconds.value = 0;
    freeCellsPeak.value = 0;
    bestChain.value = 0;
    stockDeals.value = 0;
    hint.value = null;
    lastMove.value = null;
  });
  resetPlayedSeconds();
  startTimer();
}

export function resume(saved: Session, daily: DailyChallenge | null, elapsed: number): void {
  batch(() => {
    session.value = saved;
    challenge.value = daily;
    seconds.value = elapsed;
    hint.value = null;
    lastMove.value = null;
  });
  // Al reanudar, los segundos que ya venían guardados NO se vuelven a contar en el día.
  counted = elapsed;
  startTimer();
}

function startTimer(): void {
  stopTimer();
  timer = setInterval(() => {
    if (!isWon.value) seconds.value += 1;
  }, 1000);
}

export function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

/**
 * Segundos jugados que aún no se han sumado al contador del día. Se lleva aquí, y no en el
 * store, para que el motor y el reloj de la partida sigan sin saber nada de la persistencia.
 */
let counted = 0;

export function drainPlayedSeconds(): number {
  const pending = Math.max(0, seconds.value - counted);
  counted = seconds.value;
  return pending;
}

const resetPlayedSeconds = (): void => {
  counted = 0;
};

export const clear = (): void => {
  stopTimer();
  batch(() => {
    session.value = null;
    challenge.value = null;
  });
};

/** Devuelve false si el movimiento era ilegal. La UI usa eso para el retorno animado. */
export function apply(move: Move): boolean {
  const current = session.value;
  const board = state.value;
  if (!current || !board) return false;

  const result = engineFor(board.game).applyMove(board, move);
  if (!result.ok) return false;

  batch(() => {
    session.value = push(current, move);
    lastMove.value = move;
    hint.value = null;
    if (move.kind === 'deal') stockDeals.value += 1;
    if (move.kind === 'redeal') stockDeals.value += 1;
    trackExtras(result.value);
  });
  return true;
}

/** Métricas que el estado del motor no guarda pero el Club de Estrellas necesita. */
function trackExtras(next: GameState): void {
  if (next.game === 'freecell') {
    freeCellsPeak.value = Math.max(freeCellsPeak.value, freeCellsInUse(next));
  }
  if (next.game === 'tripeaks') {
    const streak = (next as GameState & { streak?: number }).streak ?? 0;
    bestChain.value = Math.max(bestChain.value, streak);
  }
}

export function undoMove(): void {
  const current = session.value;
  if (!current || !canUndo(current)) return;
  batch(() => {
    session.value = undo(current);
    hint.value = null;
    lastMove.value = null;
  });
}

export function redoMove(): void {
  const current = session.value;
  if (!current || !canRedo(current)) return;
  batch(() => {
    session.value = redo(current);
    hint.value = null;
  });
}

export function restartGame(): void {
  const current = session.value;
  if (!current) return;
  batch(() => {
    session.value = restart(current);
    seconds.value = 0;
    freeCellsPeak.value = 0;
    bestChain.value = 0;
    stockDeals.value = 0;
    hint.value = null;
  });
}

/** La pista es el primer movimiento de `legalMoves`, que viene ordenada por calidad. */
export function requestHint(): Move | null {
  const board = state.value;
  const current = session.value;
  if (!board || !current) return null;

  const best = engineFor(board.game).legalMoves(board).find((move) => move.kind === 'move') ?? null;
  batch(() => {
    hint.value = best;
    if (best) session.value = countHint(current);
  });
  return best;
}

/** Toque inteligente: manda la carta al mejor destino legal (docs/04 §4). */
export function smartTap(from: PileRef): boolean {
  const board = state.value;
  if (!board) return false;
  const move = engineFor(board.game).autoMove(board, from);
  return move ? apply(move) : false;
}

/** "Terminar": nunca se dispara solo. El jugador pulsa, y las cartas suben animadas. */
export function autoFinishStep(): boolean {
  const board = state.value;
  if (!board) return false;
  const move = engineFor(board.game)
    .legalMoves(board)
    .find((candidate) => candidate.kind === 'move' && candidate.to.kind === 'foundation');
  return move ? apply(move) : false;
}

export function currentOutcome(): Outcome | null {
  const board = state.value;
  const current = session.value;
  if (!board || !current) return null;

  return outcomeOf(board, {
    seconds: seconds.value,
    undosUsed: current.undosUsed,
    hintsUsed: current.hintsUsed,
    freeCellsUsed: freeCellsPeak.value,
    bestChain: bestChain.value,
    stockDeals: stockDeals.value,
  });
}

/** Cuántas cartas quedan por robar: la UI lo pinta sobre el mazo. */
export const stockLeft = computed(() => {
  const board = state.value;
  if (!board) return 0;
  return pileOf(board, ref('stock', 0)).length;
});

export const today = (): string => clock?.today() ?? '1970-01-01';
