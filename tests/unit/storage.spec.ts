import { describe, expect, it } from 'vitest';
import { InMemoryRepository } from '../../src/services/storage/repository';
import { emptyAppData, parseImport, migrate, SCHEMA_VERSION, type AppData } from '../../src/services/storage/schema';
import { newSession, push, replay } from '../../src/core/history';
import { KLONDIKE_DEFAULT } from '../../src/core/games';
import { engineFor } from '../../src/core/games';
import type { Move } from '../../src/core/types';

/**
 * Un JSON corrupto no puede tumbar la app ni corromper el progreso (docs/07 §6). Estas pruebas
 * le tiran basura a la puerta de entrada a propósito.
 */

const validExport = (): string => {
  const data = emptyAppData();
  return JSON.stringify({
    ...data,
    profile: { ...data.profile, coins: 340, xp: 900 },
    progress: {
      ...data.progress,
      completedChallenges: ['2026-07-01|klondike', '2026-07-02|spider'],
      badges: ['streak-7'],
    },
  });
};

describe('importar datos', () => {
  it('acepta una copia válida y resume su contenido', () => {
    const report = parseImport(JSON.parse(validExport()));
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ days: 2, badges: 1, coins: 340 });
  });

  it('rechaza un fichero de una versión más nueva, con un mensaje claro', () => {
    const report = parseImport({ schemaVersion: SCHEMA_VERSION + 5 });
    expect(report.ok).toBe(false);
    expect(report.error).toBe('import.error.tooNew');
  });

  it('rechaza lo que no es una copia de Soledad', () => {
    expect(parseImport({ hola: 'mundo' }).ok).toBe(false);
    expect(parseImport(null).ok).toBe(false);
    expect(parseImport('cadena').ok).toBe(false);
    expect(parseImport(42).ok).toBe(false);
    expect(parseImport([]).ok).toBe(false);
  });

  it('rechaza un fichero truncado o con tipos imposibles, sin crashear', () => {
    const broken = [
      { schemaVersion: 1, profile: { coins: -50 } },
      { schemaVersion: 1, progress: { completedChallenges: 'no soy un array' } },
      { schemaVersion: 1, savedGames: [{ game: 'ajedrez' }] },
      { schemaVersion: 1, stats: { 'klondike:draw1': { played: 'muchas' } } },
    ];
    for (const raw of broken) {
      expect(() => parseImport(raw)).not.toThrow();
      expect(parseImport(raw).ok).toBe(false);
    }
  });

  it('los campos de más se ignoran, no rompen nada', () => {
    const withExtras = { ...JSON.parse(validExport()), campoDelFuturo: { x: 1 } };
    const report = parseImport(withExtras);
    expect(report.ok).toBe(true);
    expect(report.data?.profile.coins).toBe(340);
  });

  it('migrar nunca borra datos del usuario', () => {
    const old = { schemaVersion: 1, profile: { coins: 100 }, campoViejo: 'sigo aquí' };
    const migrated = migrate(old, 1) as Record<string, unknown>;
    expect(migrated['campoViejo']).toBe('sigo aquí');
    expect(migrated['schemaVersion']).toBe(SCHEMA_VERSION);
  });
});

describe('exportar → borrar → importar', () => {
  it('devuelve el progreso idéntico', async () => {
    const repo = new InMemoryRepository();
    const original = JSON.parse(validExport()) as AppData;
    await repo.save(original);

    const exported = JSON.stringify(await repo.load());
    await repo.clear();
    expect((await repo.load()).profile.coins).toBe(0);

    const report = parseImport(JSON.parse(exported));
    expect(report.ok).toBe(true);
    if (report.data) await repo.save(report.data);

    const restored = await repo.load();
    expect(restored.profile.coins).toBe(340);
    expect(restored.progress.completedChallenges).toEqual([
      '2026-07-01|klondike',
      '2026-07-02|spider',
    ]);
  });
});

describe('matar el proceso a mitad de partida', () => {
  it('al reabrir, el tablero está exacto', async () => {
    const repo = new InMemoryRepository();
    const engine = engineFor('klondike');

    // Se juega media partida.
    let session = newSession('klondike', KLONDIKE_DEFAULT, 20260712);
    for (let i = 0; i < 25; i++) {
      const board = replay(session);
      const move: Move | undefined = engine.legalMoves(board)[0];
      if (!move) break;
      session = push(session, move);
    }
    const before = replay(session);

    // El proceso muere justo después del autoguardado.
    await repo.saveGame({
      id: 'free:klondike:20260712',
      game: session.game,
      variant: session.variant,
      seed: session.seed,
      moves: [...session.moves],
      cursor: session.cursor,
      undosUsed: 0,
      hintsUsed: 0,
      seconds: 120,
      updatedAt: 0,
      challengeDate: null,
    });

    // Se reabre la app: se reproduce (seed, moves[]) y sale EXACTAMENTE el mismo tablero.
    const data = await repo.load();
    const saved = data.savedGames[0];
    expect(saved).toBeDefined();
    if (!saved) return;

    const after = replay({
      game: saved.game,
      variant: saved.variant,
      seed: saved.seed,
      moves: saved.moves,
      cursor: saved.cursor,
      undosUsed: saved.undosUsed,
      hintsUsed: saved.hintsUsed,
    });
    expect(after).toStrictEqual(before);
    // Y ocupa unas decenas de bytes, no un tablero serializado.
    expect(JSON.stringify(saved).length).toBeLessThan(3000);
  });
});
