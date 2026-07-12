import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve } from '../../src/core/solver/generic';
import { engineFor, DEFAULT_VARIANTS } from '../../src/core/games';
import { newSession, replay, undo, push } from '../../src/core/history';
import { GAME_IDS, type GameId, type Move } from '../../src/core/types';

/**
 * Partidas COMPLETAS grabadas (semilla, movimientos[]) que deben terminar en victoria, para
 * siempre (docs/09 §3.3). Si un cambio en el motor rompe una de estas partidas, un jugador que
 * tuviera esa partida guardada acaba de perderla: por eso están aquí.
 *
 * Regenerar (sólo si el cambio de reglas es deliberado):
 *   GOLDEN_UPDATE=1 npx vitest run tests/golden
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'playthroughs.golden.json');

interface Playthrough {
  readonly game: GameId;
  readonly seed: number;
  readonly moves: readonly Move[];
}

const SEEDS: Readonly<Record<GameId, number>> = {
  klondike: 7919,
  freecell: 7919,
  spider: 7919,
  pyramid: 39595,
  tripeaks: 7919,
};

const build = (): Playthrough[] => {
  const found: Playthrough[] = [];
  for (const game of GAME_IDS) {
    const seed = SEEDS[game];
    const result = solve(game, DEFAULT_VARIANTS[game], seed, { maxNodes: 120_000 });
    if (result.solved) found.push({ game, seed, moves: result.moves });
  }
  return found;
};

describe('partidas doradas: una victoria grabada sigue siendo una victoria', () => {
  if (process.env['GOLDEN_UPDATE'] === '1' || !existsSync(FIXTURE)) {
    writeFileSync(FIXTURE, `${JSON.stringify(build(), null, 2)}\n`, 'utf8');
  }
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Playthrough[];

  it('el fichero cubre los cinco juegos', () => {
    expect(new Set(golden.map((entry) => entry.game)).size).toBe(GAME_IDS.length);
  });

  it.each(golden)('$game (semilla $seed) se reproduce y termina ganada', (playthrough) => {
    const engine = engineFor(playthrough.game);
    let session = newSession(playthrough.game, DEFAULT_VARIANTS[playthrough.game], playthrough.seed);

    for (const move of playthrough.moves) {
      const board = replay(session);
      const result = engine.applyMove(board, move);
      expect(result.ok, `movimiento rechazado: ${JSON.stringify(move)}`).toBe(true);
      session = push(session, move);
    }

    expect(engine.isWon(replay(session))).toBe(true);
  });

  it.each(golden)('$game: deshacer 20 movimientos devuelve el estado de hace 20', (playthrough) => {
    const engine = engineFor(playthrough.game);
    let session = newSession(playthrough.game, DEFAULT_VARIANTS[playthrough.game], playthrough.seed);
    const total = Math.min(40, playthrough.moves.length);

    const checkpoints: string[] = [];
    for (let i = 0; i < total; i++) {
      checkpoints.push(JSON.stringify(replay(session)));
      session = push(session, playthrough.moves[i] as Move);
    }

    for (let i = 0; i < 20 && i < total; i++) session = undo(session);
    const rewound = JSON.stringify(replay(session));
    expect(rewound).toBe(checkpoints[Math.max(0, total - 20)]);
    void engine;
  });
});
