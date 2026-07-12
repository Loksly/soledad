import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { challengesFor, difficultiesFor, variantFor, type DailyManifest } from '../../src/meta/daily';
import { engineFor } from '../../src/core/games';
import { GAME_IDS } from '../../src/core/types';
import { allCards } from '../../src/core/engine';

/**
 * "El 100 % de los repartos del manifiesto están verificados como resolubles" (docs/10, fase 4).
 * Es un criterio de aceptación, así que es una prueba, no una nota al pie.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(
  readFileSync(join(ROOT, 'data', 'daily', 'manifest.json'), 'utf8'),
) as DailyManifest;

const dates = Object.keys(manifest.deals);

describe('manifiesto de retos diarios', () => {
  it('cubre un rango de fechas y no está vacío', () => {
    expect(dates.length).toBeGreaterThan(0);
    expect(manifest.version).toBe(1);
    expect(manifest.from <= manifest.to).toBe(true);
  });

  it('TODOS los repartos están marcados como verificados', () => {
    const unverified: string[] = [];
    for (const [date, entries] of Object.entries(manifest.deals)) {
      for (const [game, entry] of Object.entries(entries)) {
        if (!entry.verified) unverified.push(`${date}|${game}`);
      }
    }
    expect(unverified).toEqual([]);
  });

  it('todos los repartos traen la longitud de la solución que encontró el solver', () => {
    for (const entries of Object.values(manifest.deals)) {
      for (const entry of Object.values(entries)) {
        expect(entry.minMoves).toBeGreaterThan(0);
      }
    }
  });

  it('ningún día se queda sin sus cinco retos', () => {
    const incomplete = dates.filter((date) => Object.keys(manifest.deals[date] ?? {}).length < 5);
    expect(incomplete).toEqual([]);
  });

  it('la app usa la semilla del manifiesto y la variante que el generador verificó', () => {
    const date = dates[0]!;
    const planned = difficultiesFor(date);

    for (const challenge of challengesFor(date, manifest)) {
      const entry = manifest.deals[date]?.[challenge.game];
      expect(entry, `falta ${challenge.game} el ${date}`).toBeDefined();
      expect(challenge.seed).toBe(entry?.seed);
      expect(challenge.verified).toBe(true);
      // La variante DEBE ser la planificada: es con la que el solver demostró la resolubilidad.
      expect(challenge.variant).toStrictEqual(variantFor(challenge.game, planned[challenge.game]));
    }
  });

  it('cada semilla del manifiesto reparte un tablero legal', () => {
    // Se comprueba en unos cuantos días, no en los 365: es una prueba de humo del formato.
    for (const date of dates.slice(0, 10)) {
      for (const challenge of challengesFor(date, manifest)) {
        const state = engineFor(challenge.game).deal(challenge.seed, challenge.variant);
        const cards = allCards(state);
        const expected = challenge.game === 'spider' ? 104 : 52;
        expect(cards, `${date} ${challenge.game}`).toHaveLength(expected);
        expect(new Set(cards.map((card) => card.id)).size).toBe(expected);
      }
    }
  });

  it('el reto diario de Spider va a 1 palo: es el único que el solver sabe demostrar', () => {
    for (const date of dates.slice(0, 30)) {
      const spider = challengesFor(date, manifest).find((c) => c.game === 'spider');
      expect(spider?.variant).toStrictEqual({ game: 'spider', suits: 1 });
    }
  });

  it('una fecha fuera del manifiesto no rompe la app: se deriva y se marca no verificada', () => {
    const far = challengesFor('2099-12-31', manifest);
    expect(far).toHaveLength(GAME_IDS.length);
    for (const challenge of far) {
      expect(challenge.verified).toBe(false);
      expect(Number.isFinite(challenge.seed)).toBe(true);
      // Y aun así reparte un tablero jugable.
      expect(() => engineFor(challenge.game).deal(challenge.seed, challenge.variant)).not.toThrow();
    }
  });
});
