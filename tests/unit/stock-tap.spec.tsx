// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Board } from '../../src/ui/board/Board';
import * as game from '../../src/app/session';
import { DEFAULT_VARIANTS } from '../../src/core/games';
import { pileOf } from '../../src/core/engine';
import { ref, GAME_IDS, type GameId } from '../../src/core/types';

/**
 * TOCAR EL MAZO. Parece la interacción más tonta del juego y estaba ROTA en los cuatro juegos que
 * tienen mazo: sin ella no se puede robar, o sea que no se puede jugar.
 *
 * La causa: el hueco de la pila (`.slot`), que era quien escuchaba el toque, se pinta DEBAJO de
 * las cartas. Con el mazo lleno, el toque siempre caía en una carta — y las cartas del mazo no
 * son arrastrables, así que se lo tragaban y no hacían nada. Sólo funcionaba con el mazo vacío,
 * que es justo cuando ya no hay nada que robar.
 */

/**
 * jsdom NO implementa PointerEvent, y ese agujero es la razón de que ningún test cazara esto: el
 * tablero entero se maneja con Pointer Events, así que la interacción real nunca se probó. Se
 * suple con un MouseEvent, que jsdom sí tiene y que lleva los mismos campos que usa el tablero.
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId = 1;
  constructor(type: string, init?: MouseEventInit) {
    super(type, init);
  }
}
globalThis.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent;

// `setPointerCapture` tampoco existe en jsdom.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto['setPointerCapture'] ??= () => undefined;
proto['releasePointerCapture'] ??= () => undefined;

/**
 * Y esto es lo que hacía que la prueba no viera nada, y merece explicación porque es de las
 * trampas más finas que hay:
 *
 * Preact decide cómo registrar un manejador mirando si el elemento tiene la propiedad en
 * minúsculas (`'onpointerup' in dom`). jsdom NO la define, porque no implementa Pointer Events.
 * Así que Preact cae al `else` y registra `addEventListener('PointerUp')` — con mayúsculas — que
 * jamás casa con un evento 'pointerup'. En un navegador de verdad funciona; en jsdom, en
 * silencio, no se entera nadie.
 *
 * Definiéndolas, Preact registra 'pointerup' como en un navegador y la prueba mide lo que pasa
 * de verdad.
 */
for (const event of ['pointerdown', 'pointerup', 'pointermove', 'pointercancel']) {
  proto[`on${event}`] ??= null;
}

const DECK = { folder: 'Vertical2', back: 'blueBack' };
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  game.stopTimer();
  game.clear();
  render(null, host);
  host.remove();
});

/** Los cuatro juegos con mazo. FreeCell no tiene: reparte las 52 boca arriba. */
const WITH_STOCK: GameId[] = GAME_IDS.filter((id) => id !== 'freecell');

describe('tocar el mazo roba una carta', () => {
  it.each(WITH_STOCK)('%s', async (id) => {
    game.start(id, DEFAULT_VARIANTS[id], 12345, null);
    render(<Board deck={DECK} animations={false} />, host);

    const before = pileOf(game.state.value!, ref('stock', 0)).length;
    expect(before, `${id} debería repartir con cartas en el mazo`).toBeGreaterThan(0);
    const movesBefore = game.moves.value;

    // Se toca ENCIMA DEL MAZO: sobre la carta de arriba, que es lo que el dedo encuentra ahí.
    // Antes, el toque se perdía y no pasaba nada.
    const stockCard = host.querySelector<HTMLElement>('img.card[data-pile="stock:0"]');
    expect(stockCard, `${id}: el mazo no pinta ninguna carta`).toBeDefined();
    expect(stockCard?.getAttribute('src')).toContain('blueBack');

    await act(async () => {
      stockCard?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      stockCard?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(game.moves.value, `${id}: tocar el mazo no hizo nada`).toBeGreaterThan(movesBefore);
    expect(pileOf(game.state.value!, ref('stock', 0)).length).toBeLessThan(before);
  });
});
