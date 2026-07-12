// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { IndexedDbRepository } from '../../src/services/storage/repository';
import { fixedClock } from '../../src/services/clock';
import * as store from '../../src/app/store';
import * as game from '../../src/app/session';
import { engineFor, DEFAULT_VARIANTS } from '../../src/core/games';
import { GAME_IDS, type GameId } from '../../src/core/types';

/**
 * EL CAMINO DE PRODUCCIÓN, no el repositorio en memoria: IndexedDB de verdad.
 *
 * "Si se pierde una partida a medias, es un defecto grave" (docs/07 §2). Y se perdía: esta
 * prueba existe porque pasó de verdad, jugando.
 */

const clock = fixedClock('2026-07-12');

const playSome = (id: GameId, moves: number): void => {
  game.start(id, DEFAULT_VARIANTS[id], 12345, null);
  const engine = engineFor(id);
  for (let i = 0; i < moves; i++) {
    const board = game.state.value;
    if (!board) break;
    const move = engine.legalMoves(board)[0];
    if (!move) break;
    game.apply(move);
  }
};

beforeEach(async () => {
  const repo = new IndexedDbRepository();
  await repo.clear();
  store.attach(repo, clock);
  game.attachClock(clock);
  await store.hydrate();
  game.clear();
});

describe('la partida en curso sobrevive a cerrar la app', () => {
  it('se guarda en IndexedDB y se recupera al volver a arrancar', async () => {
    playSome('klondike', 8);
    const expected = JSON.stringify(game.state.value);
    const moves = game.moves.value;
    expect(moves).toBeGreaterThan(0);

    // Autoguardado del tablero + volcado inmediato (lo que hace `visibilitychange`).
    store.saveSession(game.session.value!, 42, null);
    await store.flush();

    // La app se cierra: se tira TODO el estado en memoria.
    game.clear();
    game.stopTimer();

    // Arranca de nuevo, con un repositorio nuevo sobre la misma base de datos.
    const fresh = new IndexedDbRepository();
    store.attach(fresh, clock);
    await store.hydrate();

    const saved = store.savedGames.value.find((entry) => entry.game === 'klondike');
    expect(saved, 'la partida no estaba guardada').toBeDefined();
    if (!saved) return;

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
      null,
      saved.seconds,
    );

    expect(JSON.stringify(game.state.value)).toBe(expected);
    expect(game.moves.value).toBe(moves);
    expect(game.seconds.value).toBe(42);
    game.stopTimer();
  });

  it('guarda una partida en curso por CADA uno de los cinco juegos, sin pisarse', async () => {
    const expected: Record<string, string> = {};

    for (const id of GAME_IDS) {
      playSome(id, 6);
      expected[id] = JSON.stringify(game.state.value);
      store.saveSession(game.session.value!, 10, null);
      game.stopTimer();
    }
    await store.flush();
    game.clear();

    const fresh = new IndexedDbRepository();
    store.attach(fresh, clock);
    await store.hydrate();

    // Las cinco siguen ahí, cada una con su tablero.
    for (const id of GAME_IDS) {
      const saved = store.savedGames.value.find((entry) => entry.game === id && entry.challengeDate === null);
      expect(saved, `se perdió la partida de ${id}`).toBeDefined();
      if (!saved) continue;

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
        null,
        saved.seconds,
      );
      expect(JSON.stringify(game.state.value), id).toBe(expected[id]);
      game.stopTimer();
    }
  });
});
