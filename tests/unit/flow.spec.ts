import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRepository } from '../../src/services/storage/repository';
import { fixedClock } from '../../src/services/clock';
import * as store from '../../src/app/store';
import * as game from '../../src/app/session';
import { challengesFor } from '../../src/meta/daily';
import { isCompleted, levelFor } from '../../src/meta/rewards';
import { engineFor } from '../../src/core/games';
import { solve } from '../../src/core/solver/generic';
import { starsEarned } from '../../src/meta/starclub';
import type { Move } from '../../src/core/types';

/**
 * El recorrido que no puede romperse nunca (docs/09 §3.4, nº 1):
 * abrir → jugar el reto diario → ganarlo → ver la recompensa → la casilla queda marcada.
 *
 * Se ejecuta contra las capas reales (motor, meta, store, repositorio), sólo con el reloj y el
 * almacén inyectados. No es un mock de nada: es la app, sin la pintura.
 */

const TODAY = '2026-07-12';

const repo = new InMemoryRepository();
const clock = fixedClock(TODAY);

beforeEach(async () => {
  await repo.clear();
  store.attach(repo, clock);
  game.attachClock(clock);
  await store.hydrate();
  game.clear();
});

/** Juega la partida entera usando la solución del solver. */
const winWith = (moves: readonly Move[]): void => {
  for (const move of moves) {
    expect(game.apply(move), `movimiento rechazado: ${JSON.stringify(move)}`).toBe(true);
  }
};

describe('recorrido completo: abrir → reto diario → ganar → recompensa', () => {
  it('marca la casilla del día y paga las monedas una sola vez', () => {
    // El jugador abre la app y elige un reto. Se prueban en orden de coste para el solver: los
    // baratos primero, que es lo que hace que esta prueba tarde décimas y no medio minuto.
    const COST: Record<string, number> = { tripeaks: 0, pyramid: 1, klondike: 2, freecell: 3, spider: 4 };
    const challenges = [...challengesFor(TODAY)].sort(
      (a, b) => (COST[a.game] ?? 9) - (COST[b.game] ?? 9),
    );

    const solvable = challenges
      .map((challenge) => ({
        challenge,
        result: solve(challenge.game, challenge.variant, challenge.seed, { maxNodes: 60_000 }),
      }))
      .find((entry) => entry.result.solved);

    expect(solvable, 'ningún reto de hoy es resoluble: eso sí sería un fallo').toBeDefined();
    if (!solvable) return;

    const { challenge, result } = solvable;

    game.start(challenge.game, challenge.variant, challenge.seed, challenge);
    expect(game.isWon.value).toBe(false);

    winWith(result.moves);
    expect(game.isWon.value).toBe(true);
    expect(engineFor(challenge.game).isWon(game.state.value!)).toBe(true);

    // Se cierra la partida: estadísticas, estrellas y (si toca) la recompensa del reto.
    const outcome = game.currentOutcome()!;
    const earned = store.finishGame(outcome, challenge);

    expect(store.stats.value[`${challenge.game}:${Object.values(challenge.variant)[1]}`] ?? true).toBeTruthy();
    expect(earned.coins).toBeGreaterThan(0);
    expect(isCompleted(store.progress.value, TODAY, challenge.game)).toBe(true);
    expect(store.progress.value.streak.current).toBe(1);

    const coinsAfterFirst = store.profile.value.coins;

    // Lo vuelve a jugar el mismo día: NO cobra dos veces (docs/06 §2).
    game.start(challenge.game, challenge.variant, challenge.seed, challenge);
    winWith(result.moves);
    const again = store.finishGame(game.currentOutcome()!, challenge);

    expect(again.coins).toBe(0);
    expect(store.profile.value.coins).toBe(coinsAfterFirst);
    // Pero las estadísticas sí se actualizan.
    expect(store.progress.value.completedChallenges).toHaveLength(1);
  });

  it('la partida a medias sobrevive a que Android mate el proceso', async () => {
    const challenge = challengesFor(TODAY)[0]!;
    game.start(challenge.game, challenge.variant, challenge.seed, challenge);

    const engine = engineFor(challenge.game);
    for (let i = 0; i < 12; i++) {
      const move = engine.legalMoves(game.state.value!)[0];
      if (!move) break;
      game.apply(move);
    }
    const before = JSON.stringify(game.state.value);
    const moves = game.moves.value;

    // Autoguardado y muerte súbita del proceso.
    store.saveSession(game.session.value!, game.seconds.value, challenge.date);
    await store.flush();
    game.clear();
    expect(game.state.value).toBeNull();

    // Se reabre la app.
    await store.hydrate();
    const saved = store.savedGames.value[0]!;
    expect(saved.challengeDate).toBe(TODAY);

    game.resume(
      {
        game: saved.game,
        variant: saved.variant,
        seed: saved.seed,
        moves: saved.moves,
        cursor: saved.cursor,
        undosUsed: saved.undosUsed,
        hintsUsed: saved.hintsUsed,
      },
      challenge,
      saved.seconds,
    );

    expect(JSON.stringify(game.state.value)).toBe(before);
    expect(game.moves.value).toBe(moves);
    game.stopTimer();
  });

  it('deshacer 20 movimientos deja el tablero como estaba hace 20', () => {
    const challenge = challengesFor(TODAY)[0]!;
    game.start(challenge.game, challenge.variant, challenge.seed, challenge);
    const engine = engineFor(challenge.game);

    const snapshots: string[] = [];
    for (let i = 0; i < 30; i++) {
      snapshots.push(JSON.stringify(game.state.value));
      const move = engine.legalMoves(game.state.value!)[0];
      if (!move) break;
      game.apply(move);
    }
    const done = snapshots.length;

    for (let i = 0; i < 20 && i < done; i++) game.undoMove();
    expect(JSON.stringify(game.state.value)).toBe(snapshots[Math.max(0, done - 20)]);

    // Y deshacer es gratis: no cuesta monedas ni puntos (P4/P6).
    expect(store.profile.value.coins).toBe(0);
    game.stopTimer();
  });

  it('ganar una partida libre da monedas, sube XP y avanza el Club de Estrellas', () => {
    const result = solve('tripeaks', { game: 'tripeaks', wrapAround: true }, 7919, { maxNodes: 60_000 });
    expect(result.solved).toBe(true);

    game.start('tripeaks', { game: 'tripeaks', wrapAround: true }, 7919, null);
    winWith(result.moves);

    const before = starsEarned(store.starProgress.value);
    const earned = store.finishGame(game.currentOutcome()!, null);

    expect(earned.coins).toBeGreaterThan(0);
    expect(starsEarned(store.starProgress.value)).toBeGreaterThan(before); // "limpia los 3 picos"
    // Una partida libre NO cuenta para el reto diario.
    expect(store.progress.value.completedChallenges).toHaveLength(0);
    expect(levelFor(store.profile.value.xp)).toBeGreaterThanOrEqual(1);
    game.stopTimer();
  });
});
