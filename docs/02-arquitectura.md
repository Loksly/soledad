# 02 — Arquitectura

## 1. Stack elegido

| Capa | Tecnología | Motivo |
|---|---|---|
| Lenguaje | **TypeScript 5.x**, `strict: true` | Toda la lógica es tipada. Prohibido `any` (ver [09](09-calidad-y-buenas-practicas.md)). |
| Build | **Vite** | Arranque instantáneo en desarrollo, salida estática pequeña. |
| UI | **Preact + Signals** | ~4 kB. React sería 45 kB para nada que necesitemos. No es negociable el tamaño. |
| Empaquetado Android | **Capacitor 6+** | Envuelve la web estática en un WebView nativo. APK pequeño, sin JS bridge en el bucle de juego, y una PWA sale gratis del mismo código. |
| Estado del juego | **Motor propio, puro y sin dependencias** | Sin Redux ni librerías. El motor es una función `(estado, movimiento) => estado`. |
| Persistencia | **IndexedDB** (vía `idb`) + `@capacitor/preferences` para ajustes | IndexedDB para partidas y estadísticas; Preferences para ajustes pequeños. |
| Pruebas | **Vitest** (unidad) + **Playwright** (E2E en WebView) | |

### Alternativas descartadas (y por qué)

- **Flutter / Kotlin nativo**: mejor rendimiento teórico, pero los assets de cartas ya son SVG
  pensados para `<img>` y el ciclo de desarrollo es mucho más lento. Un solitario no necesita
  ese rendimiento: se mueven 52 sprites.
- **React Native**: peso y complejidad injustificados.
- **Canvas / WebGL**: se descarta. DOM + CSS transforms da 60 fps de sobra con 104 cartas, y
  regalamos accesibilidad, hit-testing y layout responsive. Ver [05](05-ui-ux.md).
- **Redux / Zustand**: el motor ya es una máquina de estados inmutable; añadir una librería
  encima sólo añade indirección.

## 2. Arquitectura en capas

La regla que gobierna todo el proyecto:

> **El paquete `core/` no puede importar nada del DOM, de Capacitor, de Preact, ni del
> sistema de ficheros. Ni una línea.** Debe poder ejecutarse en Node, en un test, o en un
> Web Worker sin cambios.

```
┌──────────────────────────────────────────────────────────┐
│  ui/          Preact: pantallas, componentes, gestos     │  ← conoce todo lo de abajo
├──────────────────────────────────────────────────────────┤
│  app/         Orquestación: sesión de partida, rutas,    │
│               reloj, ciclo de vida Android               │
├──────────────────────────────────────────────────────────┤
│  services/    Persistencia, sync opcional, i18n,         │  ← efectos secundarios aislados
│               notificaciones, audio                      │     (interfaces + implementaciones)
├──────────────────────────────────────────────────────────┤
│  meta/        Retos diarios, recompensas, rachas,        │  ← puro, determinista
│               Club de Estrellas, estadísticas            │
├──────────────────────────────────────────────────────────┤
│  core/        Cartas, mazo, RNG, motor de cada juego,    │  ← puro, determinista, sin dependencias
│               validación de movimientos, undo, solver    │
└──────────────────────────────────────────────────────────┘
```

Las flechas de dependencia apuntan **sólo hacia abajo**. Se verifica en CI con
`dependency-cruiser` o una regla ESLint `no-restricted-imports`; una importación ilegal
rompe la build.

## 3. Estructura de carpetas

```
soledad/
├── assets/                       # YA EXISTE — cartas SVG de dominio público
│   └── cards/{Vertical2,Vertical4,Horizontal2,Horizontal4,Accessible}/svgs/
├── docs/                         # esta documentación
├── data/
│   └── daily/                    # manifiestos de repartos diarios verificados (generados)
├── scripts/
│   ├── generate-dailies.ts       # genera y VERIFICA los repartos diarios con el solver
│   └── build-sprite.ts           # construye el sprite SVG de cartas para la UI
├── src/
│   ├── core/
│   │   ├── card.ts               # Suit, Rank, Card, Color, helpers puros
│   │   ├── deck.ts               # baraja(s), barajado determinista
│   │   ├── rng.ts                # PRNG sembrable (mulberry32) — SIN Math.random
│   │   ├── types.ts              # GameState, Move, Pile, GameId, Variant…
│   │   ├── engine.ts             # interfaz SolitaireEngine + utilidades comunes
│   │   ├── history.ts            # undo/redo (pila de movimientos)
│   │   ├── games/
│   │   │   ├── klondike.ts
│   │   │   ├── spider.ts
│   │   │   ├── freecell.ts
│   │   │   ├── pyramid.ts
│   │   │   └── tripeaks.ts
│   │   └── solver/
│   │       ├── freecell.ts       # solver específico (rápido, casi siempre resuelve)
│   │       ├── generic.ts        # búsqueda con memoización para el resto
│   │       └── index.ts
│   ├── meta/
│   │   ├── daily.ts              # qué retos toca hoy
│   │   ├── rewards.ts            # monedas, XP, nivel
│   │   ├── streak.ts             # rachas
│   │   ├── starclub.ts           # objetivos de largo recorrido
│   │   └── stats.ts
│   ├── services/
│   │   ├── storage/              # Repository + IndexedDB + migraciones
│   │   ├── sync/                 # SyncProvider (interfaz) + implementaciones
│   │   ├── i18n/
│   │   ├── audio.ts
│   │   └── clock.ts              # ÚNICA fuente de "hoy" — inyectable en tests
│   ├── app/
│   ├── ui/
│   │   ├── board/                # tablero, pilas, carta, capa de arrastre
│   │   ├── screens/
│   │   ├── theme/
│   │   └── layout/               # cálculo de geometría responsive
│   └── main.tsx
├── android/                      # generado por Capacitor (versionado)
├── tests/
│   ├── unit/
│   ├── golden/                   # repartos y partidas de referencia
│   └── e2e/
├── capacitor.config.ts
├── vite.config.ts
└── package.json
```

## 4. Decisiones de arquitectura (ADR resumidos)

### ADR-1 — El estado del juego es inmutable y los movimientos son datos

```ts
type Move = { kind: 'move'; from: PileRef; to: PileRef; count: number }
          | { kind: 'draw' }
          | { kind: 'redeal' }
          | { kind: 'flip'; pile: PileRef };   // volteo automático, registrado para poder deshacer
```

`applyMove(state, move): Result<GameState, IllegalMove>` devuelve un **estado nuevo**; nunca
muta. Consecuencias que obtenemos gratis:

- **Deshacer/rehacer** ilimitado guardando la lista de movimientos, no copias del estado.
- **Repetición** de una partida completa desde `(semilla, movimientos[])`, que ocupa unos bytes
  → así se guarda una partida en curso, y así se depura un fallo reportado.
- **Pruebas doradas**: una partida grabada debe reproducirse idéntica para siempre.

No se usa `structuredClone` en el bucle caliente: las pilas se copian con `slice()` sólo en las
ramas afectadas (copia estructural).

### ADR-2 — Nada de aleatoriedad ambiental

`Math.random()` y `new Date()` están **prohibidos** en `core/` y `meta/` (regla ESLint que
falla la build). El azar entra siempre por una semilla explícita; la fecha entra siempre por
`services/clock.ts`. Sin esto, ni los retos diarios son iguales en todos los dispositivos ni
las pruebas son fiables.

### ADR-3 — Cada juego implementa la misma interfaz

```ts
interface SolitaireEngine<S extends GameState> {
  readonly id: GameId;
  deal(seed: number, variant: Variant): S;
  legalMoves(s: S): Move[];              // usado por pistas, autocompletado y solver
  applyMove(s: S, m: Move): Result<S>;
  isWon(s: S): boolean;
  isStuck(s: S): boolean;                // sin movimientos legales y sin robo posible
  autoMove(s: S, from: PileRef): Move | null;  // el "toque inteligente"
  score(s: S): number;
}
```

Añadir un sexto solitario = añadir un fichero en `core/games/` y registrarlo. Cero cambios
en la UI, en la persistencia o en el sistema de recompensas. Esta es la prueba de fuego de la
arquitectura.

### ADR-4 — Los efectos secundarios viven detrás de interfaces

`Repository`, `SyncProvider`, `Clock`, `Audio`, `Notifier` son interfaces. En los tests se
inyectan implementaciones en memoria. La app nunca instancia una implementación concreta
fuera de `app/bootstrap.ts`.

### ADR-5 — Sin red en la variante base

La app compila sin el permiso `INTERNET`. La sincronización en la nube es un
**flavor de build separado** (ver [08](08-android-build-y-despliegue.md)). Esto hace la promesa
"cero telemetría" **verificable** por cualquiera que inspeccione el manifiesto, en lugar de ser
una promesa que hay que creerse.
