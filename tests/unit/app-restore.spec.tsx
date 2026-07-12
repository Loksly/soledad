// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from '../../src/app/App';
import { IndexedDbRepository } from '../../src/services/storage/repository';
import { systemClock } from '../../src/services/clock';
import * as store from '../../src/app/store';
import * as game from '../../src/app/session';
import { engineFor } from '../../src/core/games';
import { GAME_IDS, type GameId } from '../../src/core/types';

/**
 * "Matar la app y reabrirla restaura el tablero exacto" (docs/10, fase 2).
 *
 * Esta prueba existe porque el fallo pasó DE VERDAD, jugando: la partida sí se guardaba, pero
 * tocar el juego repartía una nueva y la de antes quedaba enterrada en una lista que nadie veía.
 * En la práctica, jugar te borraba la partida a medias. Aquí se monta la app entera.
 */

let host: HTMLDivElement;

// jsdom no carga imágenes: sin esto la precarga del mazo no resuelve y la app se queda en la
// pantalla de "Repartiendo…". En un navegador sí resuelve (y si falla, el `onerror` desbloquea).
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
globalThis.Image = FakeImage as unknown as typeof Image;

const settle = async (ms = 10): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/** Arranca la app de cero, como si el usuario tocase el icono. */
const boot = async (): Promise<void> => {
  store.attach(new IndexedDbRepository(), systemClock);
  game.attachClock(systemClock);

  host = document.createElement('div');
  document.body.appendChild(host);
  render(<App />, host);

  // El arranque es asíncrono (hidratar + precargar el mazo): se espera a salir del splash.
  for (let i = 0; i < 100 && host.querySelector('.splash'); i++) await settle();
};

/** El proceso muere: Android lo hace sin avisar. */
const kill = async (): Promise<void> => {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
  render(null, host);
  host.remove();
  game.stopTimer();
  game.clear();
};

const click = async (selector: string): Promise<boolean> => {
  const node = host.querySelector<HTMLElement>(selector);
  if (!node) return false;
  await act(async () => {
    node.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return true;
};

const playMoves = async (count: number): Promise<void> => {
  const board = game.state.value;
  if (!board) return;
  const engine = engineFor(board.game);
  await act(async () => {
    for (let i = 0; i < count; i++) {
      const current = game.state.value;
      if (!current) break;
      const move = engine.legalMoves(current)[0];
      if (!move) break;
      game.apply(move);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

/** Menú de pausa → "Salir al inicio", que es lo que guarda y vuelve a casa. */
const quitToHome = async (): Promise<void> => {
  await click('.game-bar .icon');
  await click('.dialog button:last-child');
};

beforeEach(async () => {
  await new IndexedDbRepository().clear();
  game.clear();
});

describe('reabrir la app', () => {
  it('tocar el juego RETOMA la partida a medias, no reparte una nueva', async () => {
    await boot();

    // Sin partida guardada, tocar el juego abre el selector y reparte.
    expect(await click('.game-tile.game-klondike')).toBe(true);
    expect(host.querySelector('.dialog'), 'debería salir el selector de variante').not.toBeNull();
    await click('.dialog .primary');

    expect(game.session.value).not.toBeNull();
    await playMoves(6);

    const expected = JSON.stringify(game.state.value);
    const moves = game.moves.value;
    expect(moves).toBeGreaterThan(0);

    await kill();

    // Se abre otra vez la app y se toca el MISMO juego.
    await boot();
    expect(await click('.game-tile.game-klondike')).toBe(true);

    // No sale el selector: se ha retomado directamente, con el tablero exacto.
    expect(host.querySelector('.dialog'), 'repartió una partida nueva en vez de retomar').toBeNull();
    expect(game.state.value, 'la partida se perdió al reabrir').not.toBeNull();
    expect(JSON.stringify(game.state.value)).toBe(expected);
    expect(game.moves.value).toBe(moves);

    await kill();
  });

  it('guarda una partida a medias por cada uno de los cinco juegos, sin pisarse', async () => {
    await boot();
    const expected: Partial<Record<GameId, string>> = {};

    for (const id of GAME_IDS) {
      await click(`.game-tile.game-${id}`);
      await click('.dialog .primary');
      await playMoves(4);
      expected[id] = JSON.stringify(game.state.value);
      await quitToHome();
    }
    await act(async () => {
      await store.flush();
    });
    await kill();

    // Las cinco siguen ahí, cada una con su tablero, y la ficha lo anuncia.
    await boot();
    expect(host.querySelectorAll('.game-tile small')).toHaveLength(GAME_IDS.length);

    for (const id of GAME_IDS) {
      await click(`.game-tile.game-${id}`);
      expect(JSON.stringify(game.state.value), id).toBe(expected[id]);
      await quitToHome();
    }
    await kill();
  });

  it('el botón ＋ reparte de cero y deja UNA sola partida libre de ese juego', async () => {
    await boot();

    await click('.game-tile.game-klondike');
    await click('.dialog .primary');
    await playMoves(5);
    const first = JSON.stringify(game.state.value);
    await quitToHome();

    // El jugador pide explícitamente una partida nueva de Klondike.
    await click('.game-tile-wrap:first-child .game-new');
    await click('.dialog .primary');
    await playMoves(1);

    expect(JSON.stringify(game.state.value)).not.toBe(first);
    await quitToHome();
    await act(async () => {
      await store.flush();
    });

    const klondikes = store.savedGames.value.filter(
      (saved) => saved.game === 'klondike' && saved.challengeDate === null,
    );
    expect(klondikes, 'la partida vieja debería haberse pisado, no acumularse').toHaveLength(1);

    await kill();
  });
});
