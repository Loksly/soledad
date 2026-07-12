import { ref, type GameId, type PileRef } from '../../core/types';

/** Los SVG del repositorio miden 210 × 315. La relación es una constante del proyecto. */
export const CARD_ASPECT = 315 / 210;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Slot {
  readonly pile: PileRef;
  readonly x: number;
  readonly y: number;
  /** Desplazamiento entre cartas apiladas. 0 = montón (sólo se ve la de arriba). */
  readonly fanX: number;
  readonly fanY: number;
  readonly maxFan: number;
}

export interface Layout {
  readonly cardW: number;
  readonly cardH: number;
  readonly slots: readonly Slot[];
  readonly width: number;
  readonly height: number;
  readonly landscape: boolean;
}

const GAP_RATIO = 0.08; // Separación entre columnas, en anchos de carta.
const FAN_FACEUP = 0.26; // Solapamiento mínimo cómodo de una carta boca arriba.
const FAN_FACEDOWN = 0.13;
/**
 * Solapamiento mínimo. Subido de 0,08 a 0,16.
 *
 * Es la franja visible —y TOCABLE— de una carta enterrada en una columna. A 0,08 de una carta de
 * 55 px eran 4 píxeles: ni se lee el índice ni lo acierta un dedo, y menos un dedo que tiembla.
 * A 0,16 son 9, y la zona de toque ampliada (ui/board/Board.tsx) hace el resto.
 *
 * Cuesta alto, y por eso el abanico se sigue apretando cuando la columna es larga. Pero una
 * columna que no se puede tocar no es una columna: es un adorno.
 */
const MIN_FAN = 0.16;

/**
 * El abanico CRECE para llenar el alto disponible, no sólo se encoge para caber.
 *
 * Es la corrección más importante para el móvil. En vertical el ancho de carta lo dicta el
 * número de columnas y no hay nada que hacer (10 columnas en 412 px son cartas de 36 px), pero
 * el 70 % del alto se quedaba VACÍO mientras las cartas se amontonaban arriba en una franja
 * ilegible. Repartiendo ese alto sobrante entre las cartas de cada columna, la tira visible de
 * cada carta se hace mucho más alta: se lee mejor y, sobre todo, se puede pulsar con el dedo.
 */
const MAX_FAN = 0.62;

/** Una carta no debe pasar de esto: más grande no aporta y desperdicia pantalla. */
const MAX_CARD_W = 140;
/**
 * Barra de controles abajo (vertical) y columna de controles al lado (apaisado).
 *
 * Crecieron con los botones. Los objetivos táctiles pasaron de 44 px (que es el MÍNIMO de la
 * norma, no un objetivo) a 52-60: para una mano con temblor o artrosis, 44 px es justo. Si estos
 * números no acompañan, los botones acaban pisando las cartas de abajo.
 */
const CONTROL_BAR = 86;
const CONTROL_SIDE = 100;

interface Board {
  readonly columns: number;
  readonly rows: number;
  /** Cuántas cartas puede llegar a apilar la columna más larga, para reservar altura. */
  readonly deepest: number;
}

const BOARDS: Readonly<Record<GameId, Board>> = {
  klondike: { columns: 7, rows: 2, deepest: 19 },
  spider: { columns: 10, rows: 2, deepest: 24 },
  freecell: { columns: 8, rows: 2, deepest: 15 },
  pyramid: { columns: 7, rows: 2, deepest: 1 },
  tripeaks: { columns: 10, rows: 2, deepest: 1 },
};

/**
 * El ancho de carta lo dicta la dimensión MÁS RESTRICTIVA, y todo lo demás se deriva de él.
 * Nunca se fija un tamaño en px (docs/05 §3). Con esto el tablero no se desborda ni a 360 px de
 * ancho ni en una tablet de 1280.
 */
/**
 * El tamaño de carta se BUSCA, no se estima.
 *
 * La versión anterior derivaba el alto de una fórmula con factores a ojo (`1 + 0.35 + …`), y
 * pasaba lo que tenía que pasar: en apaisado reservaba altura para una columna profundísima que
 * no existía, las cartas salían minúsculas y media pantalla quedaba vacía. Además de feo, era
 * injugable con el dedo.
 *
 * Ahora se construye el tablero de verdad con un tamaño candidato, se mide lo que ocupa, y se
 * busca por bisección el mayor tamaño que quepa. Es exacto por construcción: no hay factor que
 * ajustar ni caso raro que se escape.
 */
export function computeLayout(
  game: GameId,
  viewport: Size,
  safe: Insets,
  /** Cartas que hay AHORA en cada pila. El abanico se calcula con esto, no con el peor caso:
   *  así una columna de 3 cartas se despliega y una de 20 se aprieta, cada una a su medida. */
  depths: Readonly<Record<string, number>> = {},
): Layout {
  const board = BOARDS[game];
  const landscape = viewport.width > viewport.height;
  const padding = 8;

  // En apaisado los controles van a un lado (una columna estrecha), no en una barra abajo: ahí
  // el alto es el recurso escaso y una barra de 64 px se come el tablero.
  const controlBar = landscape ? 0 : CONTROL_BAR;
  const controlSide = landscape ? CONTROL_SIDE : 0;

  const available: Size = {
    width: viewport.width - safe.left - safe.right - padding * 2 - controlSide,
    height: viewport.height - safe.top - safe.bottom - padding * 2 - controlBar,
  };

  const columns = board.columns;
  const maxByWidth = available.width / (columns + (columns - 1) * GAP_RATIO);

  const frameFor = (cardW: number, useRealDepths: boolean): Frame => {
    const cardH = cardW * CARD_ASPECT;
    const gap = cardW * GAP_RATIO;
    const used = columns * cardW + (columns - 1) * gap;
    return {
      cardW,
      cardH,
      gap,
      originX: safe.left + padding + Math.max(0, (available.width - used) / 2),
      originY: safe.top + padding,
      available,
      landscape,
      depths: useRealDepths ? depths : {},
      worstCase: board.deepest,
    };
  };

  /** Alto que ocupa el tablero en el PEOR caso (la columna más larga posible). El tamaño de
   *  carta se elige con esto, no con las cartas de ahora: si no, la carta cambiaría de tamaño a
   *  cada movimiento y el tablero bailaría bajo el dedo. */
  const worstBottom = (cardW: number): number => {
    const frame = frameFor(cardW, false);
    let bottom = 0;
    for (const slot of buildSlots(game, frame)) {
      const depth = DEEPEST_OF[slot.pile.kind]?.(board) ?? 1;
      bottom = Math.max(bottom, slot.y + frame.cardH + Math.max(0, depth - 1) * slot.fanY);
    }
    return bottom - frame.originY;
  };

  // Bisección sobre el ancho de carta: 24 iteraciones bastan para clavarlo al píxel.
  let low = 12;
  let high = Math.min(maxByWidth, MAX_CARD_W);
  if (worstBottom(high) <= available.height) {
    low = high;
  } else {
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (worstBottom(middle) <= available.height) low = middle;
      else high = middle;
    }
  }

  // Ya con el tamaño fijado, el abanico SÍ usa las cartas reales: se despliega para llenar.
  const frame = frameFor(low, true);
  const slots = buildSlots(game, frame);

  // Y si aun así sobra alto (una pirámide en un móvil muy alargado), el tablero se centra en
  // vez de quedarse pegado arriba con un vacío debajo. Además acerca las cartas al pulgar.
  let bottom = 0;
  for (const slot of slots) {
    // La MISMA profundidad que usó el abanico. Poner 1 por defecto (como estaba) hacía creer
    // que sobraba muchísimo alto y empujaba el tablero fuera de la pantalla.
    const real = frame.depths[`${slot.pile.kind}:${slot.pile.index}`];
    const depth = real ?? DEEPEST_OF[slot.pile.kind]?.(board) ?? 1;
    bottom = Math.max(bottom, slot.y + frame.cardH + Math.max(0, depth - 1) * slot.fanY);
  }
  const slack = available.height + frame.originY - bottom;
  const shift = slack > 0 ? slack / 2 : 0;

  return {
    cardW: frame.cardW,
    cardH: frame.cardH,
    slots: shift > 0 ? slots.map((slot) => ({ ...slot, y: slot.y + shift })) : slots,
    width: viewport.width,
    height: viewport.height,
    landscape,
  };
}

/** Cuántas cartas puede llegar a apilar cada tipo de pila. Es lo que hay que reservar a lo alto. */
const DEEPEST_OF: Readonly<Record<string, (board: Board) => number>> = {
  tableau: (board) => board.deepest,
  foundation: () => 1,
  free: () => 1,
  stock: () => 1,
  waste: () => 1,
  peaks: () => 1,
};

/**
 * Separación entre filas en los juegos de "picos" (pirámide y TriPeaks), que no tienen columnas
 * que abanicar. Se estira hasta llenar el alto disponible, con un tope para que no se separen
 * tanto que dejen de parecer una pirámide.
 */
const peakStep = (
  frame: Frame,
  top: number,
  rows: number,
  base: number,
  max: number,
): number => {
  const room = frame.originY + frame.available.height - top - frame.cardH * 1.9; // hueco de mazo
  const perRow = room / Math.max(1, rows - 1);
  return Math.min(frame.cardH * max, Math.max(frame.cardH * base, perRow));
};

interface Frame {
  readonly cardW: number;
  readonly cardH: number;
  readonly gap: number;
  readonly originX: number;
  readonly originY: number;
  readonly available: Size;
  readonly landscape: boolean;
  readonly depths: Readonly<Record<string, number>>;
  readonly worstCase: number;
}

const column = (frame: Frame, index: number): number =>
  frame.originX + index * (frame.cardW + frame.gap);

/**
 * Solapamiento adaptativo: en una columna larga de Spider (hasta ~24 cartas) el desplazamiento
 * se reduce hasta que la columna quepa, con un mínimo legible (docs/05 §3.2).
 */
const adaptiveFan = (frame: Frame, top: number, cards: number): number => {
  if (cards <= 1) return frame.cardH * FAN_FACEUP;
  // `frame.available.height` ya viene sin la barra de controles: aquí sólo queda el sitio real.
  const room = frame.originY + frame.available.height - top - frame.cardH;
  const perCard = room / (cards - 1);
  // Se reparte el hueco: ni por debajo del mínimo legible, ni tan abierto que la columna se
  // convierta en una escalera absurda.
  return Math.min(frame.cardH * MAX_FAN, Math.max(frame.cardH * MIN_FAN, perCard));
};

function buildSlots(game: GameId, frame: Frame): Slot[] {
  const { cardW, cardH, gap } = frame;
  const row0 = frame.originY;
  const row1 = row0 + cardH + gap * 1.6;
  const slots: Slot[] = [];

  const tableauFan = (index: number): Slot => {
    // Con la profundidad real cuando la hay (durante la partida), y con el peor caso cuando se
    // está eligiendo el tamaño de carta.
    const real = frame.depths[`tableau:${index}`];
    const cards = Math.max(2, real ?? frame.worstCase);
    return {
      pile: ref('tableau', index),
      x: column(frame, index),
      y: row1,
      fanX: 0,
      fanY: adaptiveFan(frame, row1, cards),
      maxFan: FAN_FACEDOWN * cardH,
    };
  };

  switch (game) {
    case 'klondike': {
      slots.push({ pile: ref('stock', 0), x: column(frame, 0), y: row0, fanX: 0, fanY: 0, maxFan: 0 });
      slots.push({
        pile: ref('waste', 0),
        x: column(frame, 1),
        y: row0,
        fanX: cardW * 0.22, // El robo de 3 abanica en horizontal: hay que ver las tres.
        fanY: 0,
        maxFan: 0,
      });
      for (let i = 0; i < 4; i++) {
        slots.push({ pile: ref('foundation', i), x: column(frame, 3 + i), y: row0, fanX: 0, fanY: 0, maxFan: 0 });
      }
      for (let i = 0; i < 7; i++) slots.push(tableauFan(i));
      break;
    }

    case 'spider': {
      slots.push({ pile: ref('stock', 0), x: column(frame, 9), y: row0, fanX: 0, fanY: 0, maxFan: 0 });
      for (let i = 0; i < 8; i++) {
        slots.push({
          pile: ref('foundation', i),
          x: column(frame, 0) + i * cardW * 0.32, // Las 8 fundaciones apiladas: sólo son un contador.
          y: row0,
          fanX: 0,
          fanY: 0,
          maxFan: 0,
        });
      }
      for (let i = 0; i < 10; i++) slots.push(tableauFan(i));
      break;
    }

    case 'freecell': {
      for (let i = 0; i < 4; i++) {
        slots.push({ pile: ref('free', i), x: column(frame, i), y: row0, fanX: 0, fanY: 0, maxFan: 0 });
      }
      for (let i = 0; i < 4; i++) {
        slots.push({ pile: ref('foundation', i), x: column(frame, 4 + i), y: row0, fanX: 0, fanY: 0, maxFan: 0 });
      }
      for (let i = 0; i < 8; i++) slots.push(tableauFan(i));
      break;
    }

    case 'pyramid': {
      const pyramidTop = row0 + cardH * 0.15;
      // La pirámide no tiene abanico que abrir, así que lo que se estira es la separación entre
      // filas: si no, quedaba pegada arriba con media pantalla vacía debajo.
      const stepY = peakStep(frame, pyramidTop, 7, 0.52, 0.72);
      for (let rowIndex = 0; rowIndex < 7; rowIndex++) {
        const start = (rowIndex * (rowIndex + 1)) / 2;
        for (let i = 0; i <= rowIndex; i++) {
          const spread = (cardW + gap) * 0.62;
          const x =
            frame.originX +
            (frame.available.width - cardW) / 2 -
            (rowIndex * spread) / 2 +
            i * spread;
          slots.push({
            pile: ref('peaks', start + i),
            x: Math.max(frame.originX * 0.4, x),
            y: pyramidTop + rowIndex * stepY,
            fanX: 0,
            fanY: 0,
            maxFan: 0,
          });
        }
      }
      const bottom = pyramidTop + 7 * stepY + cardH * 0.2;
      slots.push({ pile: ref('stock', 0), x: column(frame, 1), y: bottom, fanX: 0, fanY: 0, maxFan: 0 });
      slots.push({ pile: ref('waste', 0), x: column(frame, 3), y: bottom, fanX: 0, fanY: 0, maxFan: 0 });
      slots.push({ pile: ref('foundation', 0), x: column(frame, 5), y: bottom, fanX: 0, fanY: 0, maxFan: 0 });
      break;
    }

    case 'tripeaks': {
      // Coordenadas en medias cartas, exactamente como el grafo de cobertura de core/games.
      const unit = (cardW + gap) * 0.5;
      const left = frame.originX;
      const xs: number[] = [
        3, 9, 15,
        2, 4, 8, 10, 14, 16,
        1, 3, 5, 7, 9, 11, 13, 15, 17,
        0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
      ];
      const rows: number[] = [
        ...Array<number>(3).fill(0),
        ...Array<number>(6).fill(1),
        ...Array<number>(9).fill(2),
        ...Array<number>(10).fill(3),
      ];
      const stepY = peakStep(frame, row0, 4, 0.42, 0.62);
      for (let i = 0; i < 28; i++) {
        slots.push({
          pile: ref('peaks', i),
          x: left + (xs[i] ?? 0) * unit,
          y: row0 + (rows[i] ?? 0) * stepY,
          fanX: 0,
          fanY: 0,
          maxFan: 0,
        });
      }
      const bottom = row0 + 3 * stepY + cardH * 1.25;
      slots.push({ pile: ref('stock', 0), x: column(frame, 2), y: bottom, fanX: 0, fanY: 0, maxFan: 0 });
      slots.push({ pile: ref('waste', 0), x: column(frame, 5), y: bottom, fanX: 0, fanY: 0, maxFan: 0 });
      break;
    }
  }

  return slots;
}

export const slotFor = (layout: Layout, pile: PileRef): Slot | undefined =>
  layout.slots.find((slot) => slot.pile.kind === pile.kind && slot.pile.index === pile.index);

/** Alto total que ocupa el tablero: lo usa el contenedor para no desbordar. */
export function boardHeight(layout: Layout, depths: Readonly<Record<string, number>>): number {
  let bottom = 0;
  for (const slot of layout.slots) {
    const depth = depths[`${slot.pile.kind}:${slot.pile.index}`] ?? 1;
    const extent = slot.y + layout.cardH + Math.max(0, depth - 1) * slot.fanY;
    bottom = Math.max(bottom, extent);
  }
  return bottom;
}
