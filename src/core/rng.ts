/**
 * CONTRATO CONGELADO.
 *
 * `mulberry32` y `shuffle` definen qué reparto sale de cada semilla. Una vez publicada la v1,
 * tocar cualquiera de las dos cambia TODOS los repartos históricos: el reto del 3 de marzo de
 * 2027 dejaría de ser el mismo en el móvil de dos personas (docs/04 §2, P7).
 *
 * tests/golden/deals.spec.ts fija la salida de semillas conocidas y falla si alguien las toca.
 * Ese fallo no es un test frágil: es la red de seguridad funcionando.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates de atrás hacia delante. Parte del contrato público: ver arriba. */
export function shuffle<T>(items: readonly T[], rnd: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** FNV-1a de 32 bits: deriva semillas estables de una cadena (fecha|juego|dificultad). */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Semilla aleatoria para una partida libre. El ÚNICO Math.random() legítimo del proyecto. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
