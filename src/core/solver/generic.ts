import { engineFor } from '../games';
import { SPECS } from './heuristics';
import type { GameId, GameState, Move, Variant } from '../types';

/**
 * Búsqueda best-first con memoización de estados canónicos y presupuesto de nodos.
 *
 * Su misión NO es jugar por el usuario: es garantizar EN TIEMPO DE COMPILACIÓN que ningún reto
 * diario sea imposible (docs/04 §5). Esto no se ejecuta jamás en el móvil.
 *
 * Se probó primero un DFS puro: resolvía 0 de 6 FreeCell, cuando se sabe que ~99,999 % de los
 * repartos son resolubles. El árbol es demasiado ancho para recorrerlo a ciegas. Lo que lo hace
 * viable es la combinación de tres cosas: heurística por juego, jugadas seguras aplicadas solas
 * (que colapsan cadenas enteras en un nodo) y canonicalización de simetrías.
 */

export interface SolveResult {
  readonly solved: boolean;
  readonly moves: readonly Move[];
  readonly nodes: number;
  readonly exhausted: boolean;
}

export interface SolveOptions {
  readonly maxNodes?: number;
}

const SUIT_CODE: Readonly<Record<string, number>> = { spade: 0, heart: 1, diamond: 2, club: 3 };

/** Una carta = un carácter. Construir la clave con `+=` de strings cortos es lo más rápido
 *  que hay en V8 (ropes), y esta función se llama una vez por nodo: es el camino caliente. */
const encodeCard = (card: { suit: string; rank: number; faceUp: boolean }): string =>
  card.faceUp ? String.fromCharCode(35 + (SUIT_CODE[card.suit] ?? 0) * 13 + card.rank) : '#';

/**
 * Clave canónica: dos estados que sólo se diferencian en QUÉ columna vacía es cuál, o en qué
 * celda libre guarda la carta, son EL MISMO estado. Sin esto el árbol explota en simetrías.
 *
 * Se construye un codificador especializado por partida: la forma de las pilas no cambia
 * durante una búsqueda, así que las claves y su orden se calculan UNA vez, no por nodo.
 */
export function makeCanonical(sample: GameState): (state: GameState) => string {
  const byKind = new Map<string, string[]>();
  for (const key of Object.keys(sample.piles).sort()) {
    const kind = key.split(':')[0] ?? key;
    byKind.set(kind, [...(byKind.get(kind) ?? []), key]);
  }
  const kinds = [...byKind.keys()].sort();
  // 'peaks', 'stock' y 'waste' son posicionales: su orden importa. El resto es intercambiable.
  const positional = new Set(['stock', 'waste', 'peaks']);

  return (state: GameState): string => {
    let out = '';
    for (const kind of kinds) {
      const keys = byKind.get(kind) ?? [];
      const encoded: string[] = [];
      for (const key of keys) {
        const pile = state.piles[key] ?? [];
        let text = '';
        for (const card of pile) text += encodeCard(card);
        encoded.push(text);
      }
      if (!positional.has(kind)) encoded.sort();
      out += `${kind}:${encoded.join('|')};`;
    }
    return out;
  };
}

/** Versión de conveniencia para tests: recalcula la forma cada vez. */
export const canonical = (state: GameState): string => makeCanonical(state)(state);

/**
 * El nodo guarda un PUNTERO al padre y sólo los movimientos que lo separan de él, no la partida
 * entera. Copiar el array completo en cada hijo cuesta memoria O(n²) y hace que una búsqueda
 * larga (Spider) agote el heap de Node antes de terminar. Se comprobó a las malas.
 */
interface Node {
  readonly state: GameState;
  readonly parent: Node | null;
  readonly via: readonly Move[];
  readonly depth: number;
  readonly priority: number;
}

const pathOf = (node: Node): Move[] => {
  const moves: Move[] = [];
  for (let current: Node | null = node; current !== null; current = current.parent) {
    moves.unshift(...current.via);
  }
  return moves;
};

/** Montículo binario mínimo. Una cola de prioridad con array y nada más: sin dependencias. */
class MinHeap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.items[parent] as Node).priority <= (this.items[i] as Node).priority) break;
      [this.items[parent], this.items[i]] = [this.items[i] as Node, this.items[parent] as Node];
      i = parent;
    }
  }

  pop(): Node | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && (this.items[left] as Node).priority < (this.items[smallest] as Node).priority) smallest = left;
        if (right < this.items.length && (this.items[right] as Node).priority < (this.items[smallest] as Node).priority) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i] as Node, this.items[smallest] as Node];
        i = smallest;
      }
    }
    return top;
  }
}

export function solve(
  game: GameId,
  variant: Variant,
  seed: number,
  options: SolveOptions = {},
): SolveResult {
  const engine = engineFor(game);
  const spec = SPECS[game];
  const maxNodes = options.maxNodes ?? 60_000;

  const dealt = engine.deal(seed, variant);
  const key = makeCanonical(dealt);
  const start = spec.autoplay(dealt);
  const frontier = new MinHeap();
  const seen = new Set<string>([key(start.state)]);
  frontier.push({
    state: start.state,
    parent: null,
    via: start.moves,
    depth: start.moves.length,
    priority: spec.heuristic(start.state),
  });

  let nodes = 0;

  while (frontier.size > 0) {
    if (nodes >= maxNodes) {
      return { solved: false, moves: [], nodes, exhausted: true };
    }
    const node = frontier.pop();
    if (!node) break;
    nodes++;

    if (engine.isWon(node.state)) {
      return { solved: true, moves: pathOf(node), nodes, exhausted: false };
    }

    for (const move of engine.legalMoves(node.state)) {
      const applied = engine.applyMove(node.state, move);
      if (!applied.ok) continue;

      const forced = spec.autoplay(applied.value);
      const fingerprint = key(forced.state);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const via = [move, ...forced.moves];
      const depth = node.depth + via.length;
      // Best-first con un empujón por profundidad: sin él, la búsqueda da vueltas entre estados
      // de heurística parecida sin comprometerse con ninguna línea.
      const priority = spec.heuristic(forced.state) * 4 + depth * 0.2;
      frontier.push({ state: forced.state, parent: node, via, depth, priority });
    }
  }

  return { solved: false, moves: [], nodes, exhausted: false };
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** La dificultad sale del tamaño del árbol explorado, no de un número inventado (docs/04 §5). */
export function classify(result: SolveResult): Difficulty {
  if (!result.solved) return 'expert';
  if (result.nodes < 60) return 'easy';
  if (result.nodes < 600) return 'medium';
  if (result.nodes < 6_000) return 'hard';
  return 'expert';
}
