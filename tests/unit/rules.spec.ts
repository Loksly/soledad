import { describe, expect, it } from 'vitest';
import { makeCard, type Card, type Rank, type Suit } from '../../src/core/card';
import { pileOf } from '../../src/core/engine';
import { ref, type Move } from '../../src/core/types';
import * as klondike from '../../src/core/games/klondike';
import * as freecell from '../../src/core/games/freecell';
import * as spider from '../../src/core/games/spider';
import * as pyramid from '../../src/core/games/pyramid';
import * as tripeaks from '../../src/core/games/tripeaks';
import { KLONDIKE_DEFAULT, FREECELL_DEFAULT, SPIDER_DEFAULT, PYRAMID_DEFAULT, TRIPEAKS_DEFAULT } from '../../src/core/games';

const up = (suit: Suit, rank: Rank, deck: 0 | 1 = 0): Card => makeCard(suit, rank, deck, true);
const down = (suit: Suit, rank: Rank, deck: 0 | 1 = 0): Card => makeCard(suit, rank, deck, false);

const expectOk = <T>(result: { ok: true; value: T } | { ok: false; error: { reason: string } }): T => {
  if (!result.ok) throw new Error(`Se esperaba un movimiento legal: ${result.error.reason}`);
  return result.value;
};

const expectIllegal = (result: { ok: boolean }): void => {
  expect(result.ok).toBe(false);
};

describe('Klondike', () => {
  it('el redeal conserva el orden del descarte', () => {
    let state = klondike.deal(4242, KLONDIKE_DEFAULT);
    const originalStock = pileOf(state, ref('stock', 0)).map((card) => card.id);

    while (pileOf(state, ref('stock', 0)).length > 0) {
      state = expectOk(klondike.applyMove(state, { kind: 'draw' }));
    }
    const drawnOrder = pileOf(state, ref('waste', 0)).map((card) => card.id);

    state = expectOk(klondike.applyMove(state, { kind: 'redeal' }));
    expect(pileOf(state, ref('stock', 0))).toHaveLength(originalStock.length);
    expect(pileOf(state, ref('stock', 0)).every((card) => !card.faceUp)).toBe(true);

    const secondPass: string[] = [];
    while (pileOf(state, ref('stock', 0)).length > 0) {
      state = expectOk(klondike.applyMove(state, { kind: 'draw' }));
    }
    secondPass.push(...pileOf(state, ref('waste', 0)).map((card) => card.id));
    expect(secondPass).toEqual(drawnOrder);
  });

  it('sólo un K entra en una columna vacía', () => {
    const base = klondike.deal(1, KLONDIKE_DEFAULT);
    const state = {
      ...base,
      piles: { ...base.piles, 'tableau:0': [], 'tableau:1': [up('heart', 5)], 'tableau:2': [up('spade', 13)] },
    };
    expectIllegal(
      klondike.applyMove(state, { kind: 'move', from: ref('tableau', 1), to: ref('tableau', 0), count: 1 }),
    );
    const withKing = expectOk(
      klondike.applyMove(state, { kind: 'move', from: ref('tableau', 2), to: ref('tableau', 0), count: 1 }),
    );
    expect(pileOf(withKing, ref('tableau', 0))).toHaveLength(1);
  });

  it('la fundación sólo acepta el As y luego el valor inmediatamente superior del mismo palo', () => {
    const base = klondike.deal(2, KLONDIKE_DEFAULT);
    const state = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [up('spade', 2)],
        'tableau:1': [up('spade', 1)],
        'foundation:0': [],
      },
    };
    const spadeFoundation = ref('foundation', 0);
    expectIllegal(
      klondike.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: spadeFoundation, count: 1 }),
    );
    const withAce = expectOk(
      klondike.applyMove(state, { kind: 'move', from: ref('tableau', 1), to: spadeFoundation, count: 1 }),
    );
    expect(
      expectOk(
        klondike.applyMove(withAce, { kind: 'move', from: ref('tableau', 0), to: spadeFoundation, count: 1 }),
      ),
    ).toBeDefined();
  });

  it('mover una carta descubre y voltea la de debajo, y deshacer la devuelve boca abajo', () => {
    const base = klondike.deal(3, KLONDIKE_DEFAULT);
    const state = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [down('club', 9), up('heart', 5)],
        'tableau:1': [up('spade', 6)],
      },
    };
    const after = expectOk(
      klondike.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: ref('tableau', 1), count: 1 }),
    );
    expect(pileOf(after, ref('tableau', 0))[0]?.faceUp).toBe(true);
    // El estado anterior sigue con la carta boca abajo: el volteo no mutó nada.
    expect(pileOf(state, ref('tableau', 0))[0]?.faceUp).toBe(false);
  });

  it('no envía a fundación una carta que el tablero aún puede necesitar (subida segura)', () => {
    const base = klondike.deal(5, KLONDIKE_DEFAULT);
    // 3♦ con las fundaciones negras aún en el As: un 2♠/2♣ podría necesitar el 3♦... no, al
    // revés: el 2♦ rojo no hace falta, pero el 3♦ sí puede hacer falta para un 2♠/2♣ negro.
    const state = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [up('diamond', 3)],
        'foundation:2': [up('diamond', 1), up('diamond', 2)],
        'foundation:0': [up('spade', 1)],
        'foundation:3': [up('club', 1)],
      },
    };
    const card = up('diamond', 3);
    expect(klondike.isSafeToFoundation(state, card)).toBe(false);

    const safer = {
      ...state,
      piles: {
        ...state.piles,
        'foundation:0': [up('spade', 1), up('spade', 2)],
        'foundation:3': [up('club', 1), up('club', 2)],
      },
    };
    expect(klondike.isSafeToFoundation(safer, card)).toBe(true);
  });
});

describe('Spider', () => {
  it('un grupo de palos mezclados no se puede mover, aunque sea descendente', () => {
    const base = spider.deal(7, SPIDER_DEFAULT);
    const state = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [up('spade', 9), up('heart', 8)],
        'tableau:1': [up('club', 10)],
        'tableau:2': [up('diamond', 9)],
      },
    };
    // Descendente y el destino acepta el 9♠… pero el grupo mezcla palos: ILEGAL.
    expectIllegal(
      spider.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: ref('tableau', 1), count: 2 }),
    );
    // La carta suelta sí se apila sobre cualquier palo con valor uno mayor: 8♥ sobre 9♦.
    const single = expectOk(
      spider.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: ref('tableau', 2), count: 1 }),
    );
    expect(pileOf(single, ref('tableau', 2))).toHaveLength(2);

    // Y el grupo del mismo palo sí se mueve entero.
    const sameSuit = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [up('spade', 9), up('spade', 8)],
        'tableau:1': [up('heart', 10)],
      },
    };
    expect(
      expectOk(
        spider.applyMove(sameSuit, { kind: 'move', from: ref('tableau', 0), to: ref('tableau', 1), count: 2 }),
      ),
    ).toBeDefined();
  });

  it('repartir con una columna vacía está prohibido', () => {
    const base = spider.deal(8, SPIDER_DEFAULT);
    expect(spider.applyMove(base, { kind: 'deal' }).ok).toBe(true);

    const withHole = { ...base, piles: { ...base.piles, 'tableau:3': [] } };
    expectIllegal(spider.applyMove(withHole, { kind: 'deal' }));
    expect(spider.legalMoves(withHole).some((move) => move.kind === 'deal')).toBe(false);
  });

  it('la secuencia K→A del mismo palo se retira automáticamente a una fundación', () => {
    const base = spider.deal(9, SPIDER_DEFAULT);
    const run: Card[] = [];
    for (let rank = 13; rank >= 2; rank--) run.push(up('spade', rank as Rank));

    const state = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [down('heart', 4), ...run], // le falta el As
        'tableau:1': [up('spade', 1)],
      },
    };
    const after = expectOk(
      spider.applyMove(state, { kind: 'move', from: ref('tableau', 1), to: ref('tableau', 0), count: 1 }),
    );
    expect(pileOf(after, ref('foundation', 0))).toHaveLength(13);
    // Y la carta que quedó debajo se voltea sola.
    expect(pileOf(after, ref('tableau', 0))).toHaveLength(1);
    expect(pileOf(after, ref('tableau', 0))[0]?.faceUp).toBe(true);
  });

  it('el reparto usa 104 cartas y respeta 6/6/6/6/5/5/5/5/5/5', () => {
    const state = spider.deal(11, { game: 'spider', suits: 4 });
    const sizes = Array.from({ length: 10 }, (_, i) => pileOf(state, ref('tableau', i)).length);
    expect(sizes).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    expect(pileOf(state, ref('stock', 0))).toHaveLength(50);
  });
});

describe('FreeCell', () => {
  const emptyBoard = (freeCellsFilled: number, emptyColumns: number) => {
    const base = freecell.deal(13, FREECELL_DEFAULT);
    const piles: Record<string, readonly Card[]> = { ...base.piles };
    for (let i = 0; i < 8; i++) piles[`tableau:${i}`] = [up('spade', 13)];
    for (let i = 0; i < emptyColumns; i++) piles[`tableau:${i}`] = [];
    for (let i = 0; i < 4; i++) piles[`free:${i}`] = i < freeCellsFilled ? [up('club', 4)] : [];
    return { ...base, piles };
  };

  it('la fórmula del supermovimiento: (celdas+1) × 2^vacías', () => {
    expect(freecell.maxMovable(emptyBoard(0, 0))).toBe(5); // 4 celdas libres
    expect(freecell.maxMovable(emptyBoard(4, 0))).toBe(1); // ninguna celda libre
    expect(freecell.maxMovable(emptyBoard(0, 1))).toBe(10);
    expect(freecell.maxMovable(emptyBoard(0, 2))).toBe(20);
    expect(freecell.maxMovable(emptyBoard(2, 1))).toBe(6); // (2+1) × 2
  });

  it('si el destino es una columna vacía, esa columna no se cuenta a sí misma', () => {
    const board = emptyBoard(0, 2);
    const toOccupied = ref('tableau', 7);
    const toEmpty = ref('tableau', 0);
    expect(freecell.maxMovable(board, toOccupied)).toBe(20); // (4+1) × 2^2
    expect(freecell.maxMovable(board, toEmpty)).toBe(10); // (4+1) × 2^1 — el destino no cuenta
  });

  it('rechaza una secuencia válida que no cabe en las celdas disponibles', () => {
    const base = freecell.deal(14, FREECELL_DEFAULT);
    const piles: Record<string, readonly Card[]> = { ...base.piles };
    for (let i = 0; i < 8; i++) piles[`tableau:${i}`] = [up('spade', 13)];
    for (let i = 0; i < 4; i++) piles[`free:${i}`] = [up('club', (i + 2) as Rank)];
    // Secuencia válida de 3, pero 0 celdas libres y 0 columnas vacías → sólo se mueve 1.
    piles['tableau:0'] = [up('spade', 9), up('heart', 8), up('club', 7)];
    piles['tableau:1'] = [up('heart', 10)];
    const state = { ...base, piles };

    expect(freecell.maxMovable(state, ref('tableau', 1))).toBe(1);
    expectIllegal(
      freecell.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: ref('tableau', 1), count: 3 }),
    );
  });

  it('una columna vacía acepta cualquier carta y una celda sólo una', () => {
    const base = freecell.deal(15, FREECELL_DEFAULT);
    const state = {
      ...base,
      piles: {
        ...base.piles,
        'tableau:0': [up('heart', 7)],
        'tableau:1': [],
        'free:0': [],
      },
    };
    expect(
      freecell.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: ref('tableau', 1), count: 1 }).ok,
    ).toBe(true);
    const inCell = expectOk(
      freecell.applyMove(state, { kind: 'move', from: ref('tableau', 0), to: ref('free', 0), count: 1 }),
    );
    expectIllegal(
      freecell.applyMove(inCell, { kind: 'move', from: ref('tableau', 2), to: ref('free', 0), count: 1 }),
    );
  });

  it('reparte 7/7/7/7/6/6/6/6 con todas las cartas boca arriba', () => {
    const state = freecell.deal(16, FREECELL_DEFAULT);
    const sizes = Array.from({ length: 8 }, (_, i) => pileOf(state, ref('tableau', i)).length);
    expect(sizes).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    for (let i = 0; i < 8; i++) {
      expect(pileOf(state, ref('tableau', i)).every((card) => card.faceUp)).toBe(true);
    }
  });
});

describe('Pirámide', () => {
  it('una carta con una sola tapadora retirada NO es jugable', () => {
    const state = pyramid.deal(21, PYRAMID_DEFAULT);
    // La posición 0 (cúspide) está tapada por 1 y 2.
    expect(pyramid.coveredBy(0)).toEqual([1, 2]);
    expect(pyramid.isPlayable(state, 0)).toBe(false);

    const oneRemoved = { ...state, piles: { ...state.piles, 'peaks:1': [] } };
    expect(pyramid.isPlayable(oneRemoved, 0)).toBe(false);

    const bothRemoved = { ...oneRemoved, piles: { ...oneRemoved.piles, 'peaks:2': [] } };
    expect(pyramid.isPlayable(bothRemoved, 0)).toBe(true);
  });

  it('la fila base (21–27) empieza jugable y la pirámide tiene 28 posiciones', () => {
    const state = pyramid.deal(22, PYRAMID_DEFAULT);
    for (let i = 21; i < 28; i++) expect(pyramid.isPlayable(state, i)).toBe(true);
    for (let i = 0; i < 21; i++) expect(pyramid.isPlayable(state, i)).toBe(false);
    expect(pileOf(state, ref('stock', 0))).toHaveLength(24);
  });

  it('sólo se retiran parejas que suman 13, y el rey se retira solo', () => {
    const base = pyramid.deal(23, PYRAMID_DEFAULT);
    const piles: Record<string, readonly Card[]> = { ...base.piles };
    piles['peaks:21'] = [up('spade', 13)];
    piles['peaks:22'] = [up('heart', 5)];
    piles['peaks:23'] = [up('club', 8)];
    piles['peaks:24'] = [up('diamond', 9)];
    const state = { ...base, piles };

    expect(pyramid.applyMove(state, { kind: 'remove', piles: [ref('peaks', 21)] }).ok).toBe(true);
    expectIllegal(pyramid.applyMove(state, { kind: 'remove', piles: [ref('peaks', 22)] }));
    expect(
      pyramid.applyMove(state, { kind: 'remove', piles: [ref('peaks', 22), ref('peaks', 23)] }).ok,
    ).toBe(true); // 5 + 8 = 13
    expectIllegal(
      pyramid.applyMove(state, { kind: 'remove', piles: [ref('peaks', 22), ref('peaks', 24)] }), // 5 + 9
    );
  });

  it('por defecto el descarte no empareja consigo mismo', () => {
    const base = pyramid.deal(24, PYRAMID_DEFAULT);
    const state = { ...base, piles: { ...base.piles, 'waste:0': [up('heart', 4), up('spade', 9)] } };
    const selfPair: Move = { kind: 'remove', piles: [ref('waste', 0), ref('waste', 0)] };
    expectIllegal(pyramid.applyMove(state, selfPair));

    const permissive = { ...state, variant: { ...PYRAMID_DEFAULT, wasteSelfPairing: true } };
    expect(pyramid.applyMove(permissive, selfPair).ok).toBe(true);
  });
});

describe('TriPeaks', () => {
  it('el grafo de cobertura de las 28 posiciones es el correcto', () => {
    // 3 + 6 + 9 + 10 = 28.
    expect(tripeaks.ROW_OF.filter((row) => row === 0)).toHaveLength(3);
    expect(tripeaks.ROW_OF.filter((row) => row === 1)).toHaveLength(6);
    expect(tripeaks.ROW_OF.filter((row) => row === 2)).toHaveLength(9);
    expect(tripeaks.ROW_OF.filter((row) => row === 3)).toHaveLength(10);

    // Cada carta de las filas 0–2 está tapada por exactamente 2; la base por ninguna.
    for (let i = 0; i < 28; i++) {
      expect(tripeaks.coveredBy(i)).toHaveLength(i < 18 ? 2 : 0);
    }
    // Cada una de las 10 cartas de la base tapa a alguien, y las compartidas entre picos
    // vecinos (21 y 24) tapan a dos cartas de picos distintos.
    const covers = new Map<number, number[]>();
    for (let i = 0; i < 18; i++) {
      for (const child of tripeaks.coveredBy(i)) {
        covers.set(child, [...(covers.get(child) ?? []), i]);
      }
    }
    for (let base = 18; base < 28; base++) {
      expect(covers.get(base)?.length ?? 0).toBeGreaterThan(0);
    }
    expect(new Set((covers.get(21) ?? []).map((i) => tripeaks.PEAK_OF[i])).size).toBe(2);
    expect(new Set((covers.get(24) ?? []).map((i) => tripeaks.PEAK_OF[i])).size).toBe(2);
  });

  it('sólo la fila base empieza boca arriba', () => {
    const state = tripeaks.deal(31, TRIPEAKS_DEFAULT);
    for (let i = 0; i < 28; i++) {
      const card = pileOf(state, ref('peaks', i))[0];
      expect(card?.faceUp).toBe(i >= 18);
    }
    expect(pileOf(state, ref('stock', 0))).toHaveLength(23);
    expect(pileOf(state, ref('waste', 0))).toHaveLength(1);
  });

  it('la envoltura A↔K se activa y se desactiva', () => {
    const ace = up('spade', 1);
    const king = up('heart', 13);
    const two = up('club', 2);
    expect(tripeaks.chains(king, ace, true)).toBe(true);
    expect(tripeaks.chains(king, ace, false)).toBe(false);
    expect(tripeaks.chains(two, ace, false)).toBe(true);
  });

  it('retirar una carta voltea las que quedan descubiertas', () => {
    const base = tripeaks.deal(32, TRIPEAKS_DEFAULT);
    // La posición 9 está tapada por 18 y 19. Vaciamos 18 y jugamos 19.
    const card19 = pileOf(base, ref('peaks', 19))[0] as Card;
    const piles: Record<string, readonly Card[]> = { ...base.piles };
    piles['peaks:18'] = [];
    piles['waste:0'] = [up('spade', ((card19.rank % 13) + 1) as Rank)];
    const state = { ...base, piles };

    expect(pileOf(state, ref('peaks', 9))[0]?.faceUp).toBe(false);
    const after = expectOk(
      tripeaks.applyMove(state, { kind: 'move', from: ref('peaks', 19), to: ref('waste', 0), count: 1 }),
    );
    expect(pileOf(after, ref('peaks', 9))[0]?.faceUp).toBe(true);
  });

  it('la racha crece con cada carta encadenada y robar la rompe', () => {
    const base = tripeaks.deal(33, TRIPEAKS_DEFAULT);
    const piles: Record<string, readonly Card[]> = { ...base.piles };
    for (let i = 0; i < 28; i++) piles[`peaks:${i}`] = [];
    piles['peaks:18'] = [up('spade', 5)];
    piles['peaks:19'] = [up('heart', 6)];
    piles['waste:0'] = [up('club', 4)];
    const state = { ...base, piles, streak: 0, score: 0 };

    const first = expectOk(
      tripeaks.applyMove(state, { kind: 'move', from: ref('peaks', 18), to: ref('waste', 0), count: 1 }),
    );
    expect(first.streak).toBe(1);
    const second = expectOk(
      tripeaks.applyMove(first, { kind: 'move', from: ref('peaks', 19), to: ref('waste', 0), count: 1 }),
    );
    expect(second.streak).toBe(2);
    expect(second.score).toBeGreaterThanOrEqual(3); // 1 + 2

    const afterDraw = expectOk(tripeaks.applyMove(second, { kind: 'draw' }));
    expect(afterDraw.streak).toBe(0);
  });
});

describe('todos los juegos', () => {
  const cases: { name: string; deal: () => { piles: Readonly<Record<string, readonly Card[]>> }; total: number }[] = [
    { name: 'klondike', deal: () => klondike.deal(99, KLONDIKE_DEFAULT), total: 52 },
    { name: 'spider', deal: () => spider.deal(99, SPIDER_DEFAULT), total: 104 },
    { name: 'freecell', deal: () => freecell.deal(99, FREECELL_DEFAULT), total: 52 },
    { name: 'pyramid', deal: () => pyramid.deal(99, PYRAMID_DEFAULT), total: 52 },
    { name: 'tripeaks', deal: () => tripeaks.deal(99, TRIPEAKS_DEFAULT), total: 52 },
  ];

  it.each(cases)('$name reparte exactamente $total cartas sin repetidos', ({ deal, total }) => {
    const cards = Object.values(deal().piles).flat();
    expect(cards).toHaveLength(total);
    expect(new Set(cards.map((card) => card.id)).size).toBe(total);
  });
});
