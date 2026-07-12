import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cardSrc, backSrc } from '../../src/ui/board/cardSrc';
import { RANKS, SUITS, makeCard, assetName } from '../../src/core/card';
import { engineFor, DEFAULT_VARIANTS } from '../../src/core/games';
import { GAME_IDS } from '../../src/core/types';
import { allCards } from '../../src/core/engine';

/**
 * "Rutas de assets relativas en Capacitor: cartas en blanco en el móvil, y todo bien en el
 * escritorio" (docs/09 §8 nº 11). Es un fallo carísimo de depurar tarde, porque no aparece
 * hasta que la app está en el teléfono.
 *
 * Esta prueba lo caza en CI: comprueba que la ruta que construye la UI para CADA carta de CADA
 * juego existe de verdad en el disco, y que es absoluta.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'public');
const DECK = { folder: 'Vertical2', back: 'blueBack' };

const onDisk = (url: string): string => join(PUBLIC, url);

/**
 * Los WebP están VERSIONADOS (ver .gitignore): rasterizar 324 naipes cuesta minutos y CI parte de
 * cero en cada build. El riesgo de versionar un artefacto es que se desincronice de su fuente sin
 * que nadie se entere, así que aquí está el guardián: si alguien añade o cambia un SVG y no
 * ejecuta `npm run assets`, esto falla.
 */
describe('los WebP versionados están al día con los SVG', () => {
  const DECKS = [
    'Vertical2',
    'Vertical4',
    'Horizontal2',
    'Horizontal4',
    'Accessible/Vertical',
    'Accessible/Horizontal',
  ];

  it.each(DECKS)('%s tiene sus 54 cartas rasterizadas', (deck) => {
    const missing: string[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const file = join(PUBLIC, 'assets', 'cards', deck, `${assetName(suit, rank)}.webp`);
        if (!existsSync(file)) missing.push(file);
      }
    }
    for (const back of ['blueBack', 'redBack']) {
      const file = join(PUBLIC, 'assets', 'cards', deck, `${back}.webp`);
      if (!existsSync(file)) missing.push(file);
    }
    expect(missing, 'faltan cartas: ejecuta `npm run assets`').toEqual([]);
  });

  it('los iconos de la PWA están generados', () => {
    for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      expect(existsSync(join(PUBLIC, 'icons', icon)), `falta ${icon}`).toBe(true);
    }
  });

  it('el manifiesto de retos está copiado a public/', () => {
    expect(existsSync(join(PUBLIC, 'assets', 'daily', 'manifest.json'))).toBe(true);
  });
});

describe('rutas de las cartas', () => {
  it('las 52 caras del mazo empaquetado existen en el disco', () => {
    const missing: string[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const url = cardSrc(makeCard(suit, rank, 0, true), DECK);
        if (!existsSync(onDisk(url))) missing.push(url);
      }
    }
    expect(missing, 'faltan cartas: se verían EN BLANCO en el móvil').toEqual([]);
  });

  it('el reverso existe', () => {
    expect(existsSync(onDisk(backSrc(DECK)))).toBe(true);
    expect(existsSync(onDisk(cardSrc(makeCard('spade', 1, 0, false), DECK)))).toBe(true);
  });

  it('las rutas son ABSOLUTAS: una relativa se rompe al navegar en Capacitor', () => {
    const url = cardSrc(makeCard('heart', 13, 0, true), DECK);
    expect(url.startsWith('/assets/cards/')).toBe(true);
    expect(url).not.toContain('./');
    expect(url).not.toContain('..');
  });

  it('usa los nombres reales del repositorio (camelCase, valor en palabra)', () => {
    // docs/ui.md dice `heart_A.svg`. Ese fichero NO existe: es el error histórico que docs/05
    // corrige. Si alguien "arregla" cardSrc siguiendo ui.md, esta prueba lo para.
    expect(cardSrc(makeCard('spade', 1, 0, true), DECK)).toContain('spadeAce.webp');
    expect(cardSrc(makeCard('club', 10, 0, true), DECK)).toContain('club10.webp');
    expect(cardSrc(makeCard('heart', 13, 0, true), DECK)).toContain('heartKing.webp');
    expect(cardSrc(makeCard('diamond', 11, 0, true), DECK)).toContain('diamondJack.webp');
    expect(cardSrc(makeCard('heart', 12, 0, true), DECK)).toContain('heartQueen.webp');
  });

  it.each(GAME_IDS)('cada carta repartida en %s tiene una imagen que existe', (game) => {
    const state = engineFor(game).deal(4242, DEFAULT_VARIANTS[game]);
    const missing = allCards(state)
      .map((card) => cardSrc({ ...card, faceUp: true }, DECK))
      .filter((url) => !existsSync(onDisk(url)));
    expect(new Set(missing)).toEqual(new Set());
  });
});
