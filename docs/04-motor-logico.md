# 04 — Motor lógico

## 1. Modelo de dominio

```ts
// core/card.ts
export type Suit = 'spade' | 'heart' | 'diamond' | 'club';
export type Rank = 1|2|3|4|5|6|7|8|9|10|11|12|13;   // 1=As, 11=J, 12=Q, 13=K
export type Color = 'red' | 'black';

/** Identificador único de carta dentro de la partida.
 *  En Spider hay dos barajas → `deck` distingue los duplicados.
 *  Es OBLIGATORIO: sin él, la UI no puede animar cartas idénticas y React/Preact
 *  reciclaría los nodos equivocados. */
export interface Card {
  readonly id: string;          // p.ej. "spade-13-1"
  readonly suit: Suit;
  readonly rank: Rank;
  readonly deck: 0 | 1;
  readonly faceUp: boolean;
}

export const colorOf = (s: Suit): Color =>
  s === 'heart' || s === 'diamond' ? 'red' : 'black';
```

El estado es **plano y serializable**: sin clases, sin `Map`, sin referencias circulares. Debe
poder pasar por `JSON.stringify` sin perder nada — es la base del guardado, del undo y de las
pruebas doradas.

```ts
// core/types.ts
export type GameId = 'klondike' | 'spider' | 'freecell' | 'pyramid' | 'tripeaks';
export type PileKind = 'tableau' | 'foundation' | 'stock' | 'waste' | 'free' | 'peaks';
export interface PileRef { kind: PileKind; index: number }

export interface BaseState {
  readonly game: GameId;
  readonly variant: Variant;
  readonly seed: number;
  readonly piles: Readonly<Record<string, readonly Card[]>>;  // clave: `${kind}:${index}`
  readonly moveCount: number;
  readonly redeals: number;
  readonly score: number;
}
```

## 2. Aleatoriedad determinista

Requisito duro (P7): **el reparto del 3 de marzo de 2027 para Klondike difícil debe ser
byte a byte idéntico en todos los dispositivos, para siempre, sin servidor.** Eso implica:

```ts
// core/rng.ts — mulberry32. Rápido, sin dependencias, y su salida está congelada por contrato.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. El barajado es parte del contrato público:
 *  cambiarlo cambia TODOS los repartos históricos. Está congelado y tiene prueba dorada. */
export function shuffle<T>(items: readonly T[], rnd: () => number): T[] { /* … */ }
```

**Advertencia para el implementador:** una vez publicada la v1, `mulberry32` y `shuffle` son
**inmutables**. Si se "mejoran", el reparto del día cambia y los jugadores que compartan un
reto verán tableros distintos. Hay una prueba dorada
(`tests/golden/deals.spec.ts`) que fija el reparto de varias semillas conocidas y **debe** fallar
si alguien toca esto.

La semilla del reto diario se deriva de la fecha, sin ambigüedad de zona horaria:

```ts
// meta/daily.ts
export function dailySeed(date: string, game: GameId, difficulty: Difficulty): number {
  return fnv1a(`${date}|${game}|${difficulty}|v1`);  // date en formato YYYY-MM-DD, hora LOCAL
}
```

El sufijo `|v1` permite regenerar la tabla de retos en el futuro sin romper las semillas ya jugadas.

**Día local, no UTC.** El "día" es el del calendario del dispositivo. Todo pasa por
`services/clock.ts` (`today(): string`), que en producción lee el reloj del sistema y en pruebas
se inyecta. Nunca se llama a `new Date()` fuera de ahí. Cambios de hora, viajes y cambios
manuales del reloj se tratan en [06](06-diario-y-recompensas.md#anti-trampas).

## 3. Deshacer / rehacer

El historial es la lista de movimientos, no de estados:

```ts
interface Session {
  readonly initial: GameState;    // reconstruible desde (game, variant, seed)
  readonly moves: readonly Move[];
  readonly cursor: number;        // moves[0..cursor) están aplicados
}
```

- **Deshacer** = `cursor--` y **reproducir** desde `initial`. Con ≤ 200 movimientos y un motor
  puro esto cuesta menos de 1 ms: no hace falta guardar estados intermedios. Si el perfilado
  demostrase lo contrario, se cachea un estado cada 25 movimientos (checkpoint), no antes.
- **Rehacer** = `cursor++`, siempre que no se haya hecho un movimiento nuevo (que trunca la cola).
- Un movimiento compuesto (supermovimiento de FreeCell, retirada automática de secuencia en
  Spider, volteo automático) es **un** `Move` con sus efectos derivados calculados por el motor,
  no varios. El jugador pulsa deshacer una vez y ve exactamente lo contrario de lo que hizo.
- Deshacer es **ilimitado y gratuito**. En las apps comerciales suele costar puntos; aquí no (P4/P6).

Guardar la partida en curso es guardar `(game, variant, seed, moves[], cursor)` — unas pocas
decenas de bytes. Reanudar es reproducir. Nunca se serializa el tablero.

## 4. Pistas y toque inteligente

- `legalMoves(state)` es la primitiva de la que salen las pistas, el autocompletado, el
  detector de atasco y el solver. Debe estar **ordenada por calidad** (mejor movimiento primero)
  usando una heurística por juego:
  - Klondike: fundación > descubrir carta boca abajo > vaciar columna > mover del descarte.
  - Spider: completar secuencia > descubrir > construir mismo palo > columna vacía (que se
    penaliza, porque es un recurso escaso).
  - FreeCell: fundación segura (ver abajo) > salir de celda > descubrir > entrar en celda (penalizado).
- **Toque inteligente** (`autoMove`): un toque en una carta la manda al mejor destino legal.
  Prioriza fundación **sólo si es seguro** — es decir, no enviar un 5♦ a fundación si aún hay
  4♠/4♣ en el tablero que puedan necesitarlo. Regla estándar: es seguro subir una carta de
  valor *r* si ambas fundaciones del color contrario están en *r−1* o más. Sin esta comprobación,
  el autocompletado agresivo **hace perder partidas ganables** y es una queja clásica.
- **Autocompletado**: cuando `legalMoves` demuestra que la partida está ganada (en Klondike/FreeCell:
  no queda ninguna carta boca abajo y todo está ordenado), aparece un botón "Terminar" que anima
  las cartas a las fundaciones. Nunca se dispara solo.

## 5. Solucionador (solver)

Su misión no es jugar por el usuario: es **garantizar que ningún reto diario sea imposible**
(requisito duro de [01](01-vision-y-alcance.md) §6).

| Juego | Estrategia | Coste |
|---|---|---|
| FreeCell | DFS con heurística + memoización de estados canónicos | ms; resuelve prácticamente todo |
| Klondike | Búsqueda con horizonte + memoización. Los repartos "imposibles" existen (~ 1 de cada 50 con robo de 3) | decenas de ms – segundos |
| Spider 1 palo | Búsqueda golosa | rápido |
| Spider 4 palos | **Muy difícil.** No se busca resolución garantizada: se mide dificultad con una heurística y se aceptan sólo repartos con una puntuación mínima | segundos, sólo en build |
| Pirámide | Búsqueda exhaustiva con memo (el espacio es pequeño) | ms |
| TriPeaks | Programación dinámica sobre el estado de cobertura | ms |

**Todo esto se ejecuta en tiempo de compilación, nunca en el móvil.** `scripts/generate-dailies.ts`
genera los repartos, los verifica con el solver y escribe un manifiesto en `data/daily/`:

```json
{ "version": 1, "from": "2026-01-01", "to": "2036-12-31",
  "deals": { "2026-07-13": { "klondike": {"seed": 913245, "difficulty": "medium", "verified": true, "minMoves": 118}, "…": {} } } }
```

- El manifiesto se genera en CI (job nocturno o al hacer release) y se versiona.
- El móvil sólo **lee** la semilla → coste cero, batería cero, misma partida en todos lados.
- **Fallback** para fechas fuera del manifiesto (usuario con la app vieja en 2037): se deriva la
  semilla algorítmicamente de la fecha y se marca el reto como "no verificado". Nunca se rompe la app.
- Para un reparto no verificado, la app **no** ejecuta el solver: sería quemar batería. Simplemente
  no promete resolubilidad.

Además, el solver alimenta la **clasificación de dificultad** (fácil/medio/difícil/experto),
derivada del tamaño del árbol de búsqueda y del número mínimo de movimientos — no de un número
inventado a mano.

## 6. Rendimiento del motor

- `applyMove` y `legalMoves`: **< 1 ms** en gama media. Son puros y sin asignaciones masivas.
- Prohibido `structuredClone` y `JSON.parse(JSON.stringify(...))` en el bucle de juego.
- Copia estructural: sólo se recrean las pilas tocadas por el movimiento; el resto se comparte
  por referencia (el estado es inmutable, así que compartir es seguro y hace que la UI pueda
  comparar pilas por identidad `===` para saber qué repintar).
- El solver, si alguna vez se ejecutase en el dispositivo, iría en un **Web Worker**. Nunca en
  el hilo de la interfaz.
