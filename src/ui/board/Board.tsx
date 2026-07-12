import { useEffect, useRef, useState } from 'preact/hooks';
import type { Card } from '../../core/card';
import { pileKey, ref, type Move, type PileRef } from '../../core/types';
import { engineFor } from '../../core/games';
import { pileOf } from '../../core/engine';
import * as game from '../../app/session';
import { computeLayout, slotFor, type Layout } from '../layout/geometry';
import { cardSrc, type DeckStyle } from './cardSrc';
import { feedback } from '../../services/feedback';

/**
 * Renderizado con DOM + CSS `transform` (docs/05 §2). Cada carta es UN nodo con `key={card.id}`,
 * así que mover una carta entre pilas REPOSICIONA el mismo nodo en vez de destruirlo y crear
 * otro — que es lo que permite animarla. Nunca `left`/`top`: fuerzan layout; `transform` va a
 * la GPU (docs/09 §8 nº 10).
 */

const DRAG_THRESHOLD = 8; // px antes de considerarlo arrastre: un toque tembloroso no lo es.
const MAGNET = 0.4; // El dedo tapa la carta. Ser estricto aquí se siente como un fallo del juego.

interface Placed {
  readonly card: Card;
  readonly pile: PileRef;
  readonly indexInPile: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly draggable: boolean;
}

interface DragState {
  readonly from: PileRef;
  readonly count: number;
  readonly cards: readonly string[];
  readonly startX: number;
  readonly startY: number;
  readonly dx: number;
  readonly dy: number;
  readonly active: boolean;
  readonly targets: readonly PileRef[];
}

export interface BoardProps {
  readonly deck: DeckStyle;
  readonly animations: boolean;
  readonly onMove?: (move: Move) => void;
}

export function Board({ deck, animations, onMove }: BoardProps): preact.JSX.Element | null {
  const container = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 360, height: 640 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flying, setFlying] = useState<readonly string[]>([]);
  const board = game.state.value;

  useEffect(() => {
    const measure = (): void => {
      const node = container.current;
      if (!node) return;
      setViewport({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    // Rotar la pantalla recalcula el layout; la partida no se toca (docs/08 §7).
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  /**
   * Las cartas que acaban de moverse se elevan mientras dura el viaje. Sin esto, una carta que
   * cruza el tablero pasa POR DEBAJO de las columnas que hay en medio, que se ve fatal: el
   * z-index final es el de su pila de destino, y se aplica de golpe.
   */
  useEffect(() => {
    const move = game.lastMove.value;
    const state = game.state.value;
    if (!move || !state || move.kind !== 'move') return;

    const destination = pileOf(state, move.to);
    const ids = destination.slice(destination.length - move.count).map((card) => card.id);
    setFlying(ids);

    const timer = setTimeout(() => setFlying([]), animations ? 200 : 0);
    return () => clearTimeout(timer);
  }, [game.lastMove.value, animations]);

  if (!board) return null;

  const safe = readSafeArea();
  // Las cartas que hay AHORA en cada pila: el abanico se abre para llenar el alto libre en vez
  // de amontonarlas arriba dejando media pantalla vacía.
  const depths: Record<string, number> = {};
  for (const [key, pile] of Object.entries(board.piles)) depths[key] = pile.length;
  const layout = computeLayout(board.game, viewport, safe, depths);
  const placed = place(board, layout);
  const byId = new Map(placed.map((entry) => [entry.card.id, entry]));

  const legal = engineFor(board.game).legalMoves(board);

  const beginDrag = (event: PointerEvent, entry: Placed): void => {
    if (!entry.draggable) return;
    const pile = pileOf(board, entry.pile);
    const count = pile.length - entry.indexInPile;

    // Destinos válidos, resaltados en cuanto empieza el arrastre. Es calidad de vida pura y es
    // lo que separa una app agradable de una frustrante (docs/05 §4).
    const targets = legal
      .filter(
        (move) =>
          move.kind === 'move' &&
          pileKey(move.from) === pileKey(entry.pile) &&
          move.count === count,
      )
      .map((move) => (move.kind === 'move' ? move.to : ref('tableau', 0)));

    setDrag({
      from: entry.pile,
      count,
      cards: pile.slice(entry.indexInPile).map((card) => card.id),
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      active: false,
      targets,
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent): void => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const active = drag.active || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    setDrag({ ...drag, dx, dy, active });
  };

  const endDrag = (event: PointerEvent): void => {
    if (!drag) return;
    const current = drag;
    setDrag(null);

    // Sin superar el umbral, es un TOQUE: toque inteligente (docs/05 §4.2).
    if (!current.active) {
      const moved = game.smartTap(current.from);
      if (moved) feedback.drop();
      else feedback.invalid();
      return;
    }

    const head = byId.get(current.cards[0] ?? '');
    if (!head) return;

    const dropX = head.x + current.dx + layout.cardW / 2;
    const dropY = head.y + current.dy + layout.cardH / 2;

    // Soltar con imán: si el centro cae a menos del 40 % del ancho de carta de un destino
    // legal, se acepta. Sin esto, el juego se siente injusto.
    let best: PileRef | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const target of current.targets) {
      const slot = slotFor(layout, target);
      if (!slot) continue;
      const depth = pileOf(board, target).length;
      const targetX = slot.x + layout.cardW / 2;
      const targetY = slot.y + Math.max(0, depth - 1) * slot.fanY + layout.cardH / 2;
      const distance = Math.hypot(dropX - targetX, dropY - targetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }

    const reach = layout.cardW * (1 + MAGNET);
    if (best && bestDistance < reach) {
      const move: Move = { kind: 'move', from: current.from, to: best, count: current.count };
      if (game.apply(move)) {
        feedback.drop();
        onMove?.(move);
        return;
      }
    }
    // Destino ilegal: la carta vuelve animada a su sitio. Nunca se queda tirada.
    feedback.invalid();
    void event;
  };

  const tapPile = (pile: PileRef): void => {
    if (pile.kind !== 'stock') return;
    if (game.smartTap(pile)) feedback.tap();
    else feedback.invalid();
  };

  const byRenderOrder = [...placed].sort((a, b) => (a.card.id < b.card.id ? -1 : 1));

  const hinted = game.hint.value;
  const hintedIds = new Set<string>();
  if (hinted?.kind === 'move') {
    const pile = pileOf(board, hinted.from);
    pile.slice(pile.length - hinted.count).forEach((card) => hintedIds.add(card.id));
  }

  return (
    <div class="board" ref={container} style={{ touchAction: 'none' }}>
      {layout.slots.map((slot) => {
        const highlighted =
          drag?.active === true &&
          drag.targets.some((target) => pileKey(target) === pileKey(slot.pile));
        return (
          <div
            key={pileKey(slot.pile)}
            class={`slot slot-${slot.pile.kind}${highlighted ? ' slot-target' : ''}`}
            style={{
              width: `${layout.cardW}px`,
              height: `${layout.cardH}px`,
              transform: `translate3d(${slot.x}px, ${slot.y}px, 0)`,
            }}
            onPointerUp={() => tapPile(slot.pile)}
          />
        );
      })}

      {/*
        ORDEN DE RENDERIZADO ESTABLE, y esto es lo que hace que la animación exista.

        `placed` viene ordenado por pila, así que al mover una carta cambiaba de sitio en la
        lista y Preact reordenaba el nodo en el DOM. Reinsertar un elemento reinicia su
        transición: la carta aparecía de golpe en el destino en vez de viajar hasta él.

        Pintándolas siempre en el mismo orden (por `id`), el nodo NUNCA se mueve de sitio en el
        árbol: sólo le cambia el `transform`, y el navegador lo interpola. El apilamiento visual
        lo da el `z-index`, que para eso está.
      */}
      {byRenderOrder.map((entry) => {
        const dragging = drag?.cards.includes(entry.card.id) === true && drag.active;
        const offsetX = dragging ? drag.dx : 0;
        const offsetY = dragging ? drag.dy : 0;

        return (
          <img
            key={entry.card.id}
            class={
              `card${dragging ? ' card-dragging' : ''}` +
              `${flying.includes(entry.card.id) ? ' card-flying' : ''}` +
              `${hintedIds.has(entry.card.id) ? ' card-hint' : ''}` +
              `${animations ? '' : ' card-instant'}`
            }
            src={cardSrc(entry.card, deck)}
            alt=""
            draggable={false}
            style={{
              width: `${layout.cardW}px`,
              height: `${layout.cardH}px`,
              transform: `translate3d(${entry.x + offsetX}px, ${entry.y + offsetY}px, 0)${dragging ? ' scale(1.05)' : ''}`,
              zIndex: dragging ? 1000 + entry.z : flying.includes(entry.card.id) ? 900 + entry.z : entry.z,
              willChange: dragging || flying.includes(entry.card.id) ? 'transform' : 'auto',
            }}
            onPointerDown={(event) => beginDrag(event, entry)}
            onPointerMove={(event) => moveDrag(event)}
            onPointerUp={(event) => endDrag(event)}
            onPointerCancel={() => setDrag(null)}
          />
        );
      })}
    </div>
  );
}

/** Coloca cada carta del estado en su píxel. Es una función pura del estado (docs/05 §2). */
function place(board: NonNullable<typeof game.state.value>, layout: Layout): Placed[] {
  const engine = engineFor(board.game);
  const legal = engine.legalMoves(board);
  const movable = new Set(
    legal
      .filter((move) => move.kind === 'move')
      .map((move) => (move.kind === 'move' ? `${pileKey(move.from)}#${move.count}` : '')),
  );

  const placed: Placed[] = [];
  let z = 0;

  for (const slot of layout.slots) {
    const pile = pileOf(board, slot.pile);
    let offset = 0;

    pile.forEach((card, index) => {
      const count = pile.length - index;
      const draggable =
        (slot.pile.kind === 'tableau' || slot.pile.kind === 'waste' || slot.pile.kind === 'free' || slot.pile.kind === 'peaks') &&
        card.faceUp &&
        (movable.has(`${pileKey(slot.pile)}#${count}`) || slot.pile.kind === 'peaks');

      placed.push({
        card,
        pile: slot.pile,
        indexInPile: index,
        x: slot.x + (slot.fanX > 0 ? Math.max(0, index - (pile.length - 3)) * slot.fanX : 0),
        y: slot.y + offset,
        z: z++,
        draggable,
      });

      // Las cartas boca abajo se solapan más: ocupan menos y no hay nada que leer en ellas.
      if (slot.fanY > 0 && index < pile.length - 1) {
        offset += card.faceUp ? slot.fanY : Math.min(slot.maxFan, slot.fanY);
      }
    });
  }
  return placed;
}

function readSafeArea(): { top: number; right: number; bottom: number; left: number } {
  if (typeof getComputedStyle === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(document.documentElement);
  const read = (name: string): number => Number.parseFloat(style.getPropertyValue(name) || '0') || 0;
  return {
    top: read('--safe-top'),
    right: read('--safe-right'),
    bottom: read('--safe-bottom'),
    left: read('--safe-left'),
  };
}
