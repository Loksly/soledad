import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { engineFor, DEFAULT_VARIANTS, VARIANTS_OF } from '../../src/core/games';
import { allCards } from '../../src/core/engine';
import { GAME_IDS, type GameId, type GameState, type Move, type Variant } from '../../src/core/types';
import { mulberry32 } from '../../src/core/rng';

/**
 * Estas cuatro propiedades cazan la inmensa mayoría de los fallos de un motor de solitario
 * (docs/09 §3.2). Se ejecutan sobre los cinco juegos y todas sus variantes.
 */

const expectedCards = (game: GameId): number => (game === 'spider' ? 104 : 52);

const playRandomly = (
  game: GameId,
  variant: Variant,
  seed: number,
  steps: number,
  onStep?: (before: GameState, move: Move, after: GameState) => void,
): GameState => {
  const engine = engineFor(game);
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  let state = engine.deal(seed, variant);

  for (let i = 0; i < steps; i++) {
    const moves = engine.legalMoves(state);
    if (moves.length === 0) break;
    const move = moves[Math.floor(rnd() * moves.length)] as Move;
    const result = engine.applyMove(state, move);
    expect(result.ok, `movimiento legal rechazado: ${JSON.stringify(move)}`).toBe(true);
    if (!result.ok) break;
    onStep?.(state, move, result.value);
    state = result.value;
  }
  return state;
};

const allVariants = (game: GameId): readonly Variant[] => VARIANTS_OF[game];

describe.each(GAME_IDS)('propiedades del motor: %s', (game) => {
  const variants = allVariants(game);

  it('conserva las cartas: ni una duplicada, ni una perdida', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.nat(variants.length - 1), (seed, vi) => {
        const variant = variants[vi] ?? DEFAULT_VARIANTS[game];
        const total = expectedCards(game);

        const check = (state: GameState): void => {
          const cards = allCards(state);
          expect(cards).toHaveLength(total);
          expect(new Set(cards.map((card) => card.id)).size).toBe(total);
        };

        check(engineFor(game).deal(seed, variant));
        const final = playRandomly(game, variant, seed, 120, (_, __, after) => check(after));
        check(final);
      }),
      { numRuns: 40 },
    );
  });

  it('deshacer devuelve exactamente el estado anterior', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.nat(variants.length - 1), (seed, vi) => {
        const variant = variants[vi] ?? DEFAULT_VARIANTS[game];
        const engine = engineFor(game);
        const history: GameState[] = [];
        const moves: Move[] = [];

        playRandomly(game, variant, seed, 60, (before, move) => {
          history.push(before);
          moves.push(move);
        });

        // Reproducir n movimientos desde el reparto debe dar el mismo estado que había antes
        // del movimiento n: es lo que hace `undo` (docs/04 §3).
        for (let n = 0; n < history.length; n++) {
          let state = engine.deal(seed, variant);
          for (let i = 0; i < n; i++) {
            const result = engine.applyMove(state, moves[i] as Move);
            if (!result.ok) throw new Error(result.error.reason);
            state = result.value;
          }
          expect(state).toStrictEqual(history[n]);
        }
      }),
      { numRuns: 15 },
    );
  });

  it('un movimiento ilegal devuelve error y no toca el estado', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const variant = DEFAULT_VARIANTS[game];
        const engine = engineFor(game);
        const state = playRandomly(game, variant, seed, 30);
        const before = JSON.stringify(state);

        const nonsense: Move[] = [
          { kind: 'move', from: { kind: 'tableau', index: 0 }, to: { kind: 'stock', index: 0 }, count: 99 },
          { kind: 'move', from: { kind: 'foundation', index: 3 }, to: { kind: 'foundation', index: 3 }, count: 1 },
          { kind: 'remove', piles: [{ kind: 'tableau', index: 0 }, { kind: 'tableau', index: 0 }] },
          { kind: 'deal' },
          { kind: 'redeal' },
          { kind: 'draw' },
        ];

        for (const move of nonsense) {
          const legal = engine
            .legalMoves(state)
            .some((candidate) => JSON.stringify(candidate) === JSON.stringify(move));
          if (legal) continue;
          const result = engine.applyMove(state, move);
          expect(result.ok, `aceptó un movimiento ilegal: ${JSON.stringify(move)}`).toBe(false);
          expect(JSON.stringify(state)).toBe(before);
        }
      }),
      { numRuns: 30 },
    );
  });

  it('es determinista: la misma semilla da el mismo reparto y la misma partida', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const variant = DEFAULT_VARIANTS[game];
        expect(engineFor(game).deal(seed, variant)).toStrictEqual(
          engineFor(game).deal(seed, variant),
        );
        expect(playRandomly(game, variant, seed, 50)).toStrictEqual(
          playRandomly(game, variant, seed, 50),
        );
      }),
      { numRuns: 30 },
    );
  });

  it('si no está ganada ni atascada, hay al menos un movimiento legal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const engine = engineFor(game);
        const state = playRandomly(game, DEFAULT_VARIANTS[game], seed, 80);
        if (!engine.isWon(state) && !engine.isStuck(state)) {
          expect(engine.legalMoves(state).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe('rendimiento del motor', () => {
  it('applyMove y legalMoves cuestan menos de 1 ms', () => {
    const engine = engineFor('klondike');
    let state = engine.deal(20260712, DEFAULT_VARIANTS.klondike);
    const started = performance.now();
    let applied = 0;

    for (let i = 0; i < 500; i++) {
      const moves = engine.legalMoves(state);
      const move = moves[0];
      if (!move) break;
      const result = engine.applyMove(state, move);
      if (!result.ok) break;
      state = result.value;
      applied++;
    }
    const perMove = (performance.now() - started) / Math.max(1, applied);
    expect(perMove).toBeLessThan(1);
  });
});
