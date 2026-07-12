import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  countHint,
  initialState,
  moveCount,
  newSession,
  push,
  redo,
  replay,
  restart,
  undo,
  usedUndo,
} from '../../src/core/history';
import { engineFor, KLONDIKE_DEFAULT, SPIDER_DEFAULT } from '../../src/core/games';
import type { Move } from '../../src/core/types';

/**
 * Deshacer es ILIMITADO Y GRATIS: es una de las promesas centrales del proyecto (P4/P6), y el
 * historial es donde vive. Que estuviera a un 66 % de cobertura era una vergüenza escondida
 * detrás de un número global bonito.
 *
 * El historial guarda MOVIMIENTOS, no estados: deshacer es retroceder el cursor y reproducir
 * desde el reparto (docs/04 §3). Todo lo que sigue prueba esa idea.
 */

const engine = engineFor('klondike');
const fresh = () => newSession('klondike', KLONDIKE_DEFAULT, 20260712);

/** Juega `count` movimientos legales, siempre el primero que ofrece el motor. */
const play = (count: number) => {
  let session = fresh();
  for (let i = 0; i < count; i++) {
    const move: Move | undefined = engine.legalMoves(replay(session))[0];
    if (!move) break;
    session = push(session, move);
  }
  return session;
};

describe('historial', () => {
  it('una partida nueva no tiene nada que deshacer ni rehacer', () => {
    const session = fresh();
    expect(canUndo(session)).toBe(false);
    expect(canRedo(session)).toBe(false);
    expect(moveCount(session)).toBe(0);
    expect(usedUndo(session)).toBe(false);
    expect(replay(session)).toStrictEqual(initialState(session));
  });

  it('deshacer y rehacer recorren la partida en los dos sentidos', () => {
    const session = play(10);
    expect(moveCount(session)).toBe(10);

    const boards = [replay(session)];
    let cursor = session;
    for (let i = 0; i < 10; i++) {
      cursor = undo(cursor);
      boards.push(replay(cursor));
    }
    expect(canUndo(cursor)).toBe(false);
    expect(replay(cursor)).toStrictEqual(initialState(session));

    // Rehacer devuelve exactamente por donde se vino.
    for (let i = 9; i >= 0; i--) {
      expect(canRedo(cursor)).toBe(true);
      cursor = redo(cursor);
      expect(replay(cursor)).toStrictEqual(boards[i]);
    }
    expect(canRedo(cursor)).toBe(false);
  });

  it('deshacer al principio y rehacer al final no hacen nada', () => {
    const start = fresh();
    expect(undo(start)).toStrictEqual(start);

    const played = play(3);
    expect(redo(played)).toStrictEqual(played);
  });

  it('un movimiento nuevo trunca la cola de rehacer', () => {
    // La línea temporal alternativa desaparece: es lo que espera cualquiera que haya usado un
    // editor de texto.
    const session = play(6);
    const rewound = undo(undo(session));
    expect(canRedo(rewound)).toBe(true);
    expect(rewound.moves).toHaveLength(6);

    const move = engine.legalMoves(replay(rewound))[0] as Move;
    const diverged = push(rewound, move);

    expect(canRedo(diverged)).toBe(false);
    expect(diverged.moves).toHaveLength(5); // los 4 previos + el nuevo
    expect(moveCount(diverged)).toBe(5);
  });

  it('el contador de deshacer sirve al reto "gana sin deshacer"', () => {
    // No basta con mirar si hay cola de rehacer: el reto `noUndo` y el Club de Estrellas
    // necesitan saber si se deshizo ALGUNA VEZ, aunque luego se rehiciera todo.
    const session = play(4);
    expect(usedUndo(session)).toBe(false);

    const after = redo(undo(session));
    expect(canRedo(after)).toBe(false); // se rehízo todo…
    expect(usedUndo(after)).toBe(true); // …pero deshizo, y eso no se borra
    expect(after.undosUsed).toBe(1);
  });

  it('reiniciar deja la partida como recién repartida, con el mismo reparto', () => {
    const session = countHint(undo(play(8)));
    expect(session.hintsUsed).toBe(1);
    expect(session.undosUsed).toBe(1);

    const again = restart(session);
    expect(again.seed).toBe(session.seed);
    expect(again.moves).toEqual([]);
    expect(again.cursor).toBe(0);
    // Los contadores también vuelven a cero: si no, reiniciar arrastraría el "hizo trampa" de la
    // partida anterior a la nueva.
    expect(again.undosUsed).toBe(0);
    expect(again.hintsUsed).toBe(0);
    expect(replay(again)).toStrictEqual(initialState(session));
  });

  it('las pistas se cuentan', () => {
    const session = countHint(countHint(fresh()));
    expect(session.hintsUsed).toBe(2);
  });

  it('guardar la partida ocupa menos que guardar el tablero', () => {
    // Es la razón de ser de todo esto: se persiste (semilla, movimientos), no las 52 cartas con
    // su posición. Y la diferencia crece a favor del historial cuanto más grande es el juego.
    const session = play(30);
    const asMoves = JSON.stringify(session).length;
    const asBoard = JSON.stringify(replay(session)).length;

    expect(asMoves).toBeLessThan(asBoard);

    // En Spider la brecha es abismal: 104 cartas de tablero contra una lista de movimientos.
    const spider = newSession('spider', SPIDER_DEFAULT, 99);
    expect(JSON.stringify(spider).length).toBeLessThan(
      JSON.stringify(replay(spider)).length / 10,
    );
  });

  it('un historial corrupto se detecta y no se traga en silencio', () => {
    const broken = {
      ...fresh(),
      moves: [{ kind: 'move', from: { kind: 'tableau', index: 0 }, to: { kind: 'foundation', index: 3 }, count: 9 }] as Move[],
      cursor: 1,
    };
    // Reproducir un movimiento imposible lanza, con el juego y la semilla en el mensaje: es lo
    // que permite depurar un fallo reportado. Devolver un tablero a medias sería mucho peor.
    expect(() => replay(broken)).toThrow(/Historial corrupto/);
  });
});
