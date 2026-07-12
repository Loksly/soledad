import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, shuffle, fnv1a } from '../../src/core/rng';
import { engineFor, DEFAULT_VARIANTS } from '../../src/core/games';
import { GAME_IDS } from '../../src/core/types';

/**
 * LA RED DE SEGURIDAD DEL PROYECTO.
 *
 * Si alguien "mejora" el PRNG o el barajado, estas pruebas fallan. Ese fallo NO es un test
 * frágil que haya que actualizar: significa que el reto diario del 3 de marzo de 2027 acaba de
 * cambiar para todo el mundo que ya lo jugó (docs/04 §2, docs/09 §8 nº 8).
 *
 * Si necesitas regenerar el fichero (sólo antes de publicar la v1):
 *   GOLDEN_UPDATE=1 npx vitest run tests/golden
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'deals.golden.json');
const SEEDS = [0, 1, 12345, 913245, 20260712, 4294967295];

interface Golden {
  readonly rng: readonly number[];
  readonly shuffle: readonly number[];
  readonly fnv: Record<string, number>;
  readonly deals: Record<string, Record<string, readonly string[]>>;
}

const build = (): Golden => {
  const rnd = mulberry32(12345);
  const rng = Array.from({ length: 8 }, () => Number(rnd().toFixed(12)));

  const deals: Record<string, Record<string, readonly string[]>> = {};
  for (const game of GAME_IDS) {
    const perSeed: Record<string, readonly string[]> = {};
    for (const seed of SEEDS) {
      const state = engineFor(game).deal(seed, DEFAULT_VARIANTS[game]);
      // Serialización estable: pilas ordenadas por clave, cartas por id + cara.
      perSeed[String(seed)] = Object.keys(state.piles)
        .sort()
        .map(
          (key) =>
            `${key}=${(state.piles[key] ?? [])
              .map((card) => `${card.id}${card.faceUp ? '^' : 'v'}`)
              .join(',')}`,
        );
    }
    deals[game] = perSeed;
  }

  return {
    rng,
    shuffle: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mulberry32(777)),
    fnv: {
      '2027-03-03|klondike|hard|v1': fnv1a('2027-03-03|klondike|hard|v1'),
      'soledad': fnv1a('soledad'),
    },
    deals,
  };
};

describe('pruebas doradas: el reparto está congelado', () => {
  const current = build();

  if (process.env['GOLDEN_UPDATE'] === '1' || !existsSync(FIXTURE)) {
    writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }

  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden;

  it('mulberry32 produce exactamente la misma secuencia', () => {
    expect(current.rng).toEqual(golden.rng);
  });

  it('el barajado de Fisher-Yates es el mismo', () => {
    expect(current.shuffle).toEqual(golden.shuffle);
  });

  it('fnv1a deriva las mismas semillas de las mismas fechas', () => {
    expect(current.fnv).toEqual(golden.fnv);
  });

  it.each(GAME_IDS)('el reparto de %s es idéntico para las semillas conocidas', (game) => {
    expect(current.deals[game]).toEqual(golden.deals[game]);
  });

  it('deal(12345) da el mismo tablero en 100 ejecuciones', () => {
    const first = JSON.stringify(engineFor('klondike').deal(12345, DEFAULT_VARIANTS.klondike));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(engineFor('klondike').deal(12345, DEFAULT_VARIANTS.klondike))).toBe(first);
    }
  });
});
