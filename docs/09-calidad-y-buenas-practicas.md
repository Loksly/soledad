# 09 — Calidad y buenas prácticas

Reglas de obligado cumplimiento para quien implemente el proyecto (persona o IA).

## 1. TypeScript

```jsonc
// tsconfig.json — no negociable
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,     // piles[i] es T | undefined: obliga a pensar
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true
  }
}
```

- **`any` está prohibido** (`@typescript-eslint/no-explicit-any` en `error`). Si algo no se
  puede tipar, es `unknown` + validación con Zod.
- **Ninguna aserción `as`** salvo en los límites del sistema (parseo de JSON), y ahí sólo tras
  validar.
- Todo dato que entre desde fuera (fichero importado, blob de la nube, `localStorage`) se
  **valida con Zod** antes de tocarlo. Un JSON corrupto no puede tumbar la app.
- Uniones discriminadas (`kind`) + `switch` **exhaustivo** con `never` en el `default`. Así,
  añadir un juego o un tipo de movimiento provoca **errores de compilación** en cada sitio que
  hay que actualizar, en vez de fallos silenciosos en tiempo de ejecución.

```ts
const assertNever = (x: never): never => { throw new Error(`Caso no cubierto: ${JSON.stringify(x)}`); };
```

## 2. Estilo y estructura

- Funciones puras por defecto. Los efectos secundarios viven en `services/` y sólo ahí.
- **Ficheros < 300 líneas.** Si un motor crece más, es que mezcla responsabilidades.
- Nombres del dominio en el código: `tableau`, `foundation`, `stock`, `waste`, `freeCell` — no
  `arr1`, `pilaA`, `temp`.
- **Comentarios sólo para el "por qué"**, nunca para el "qué". Un comentario que explique una
  regla no evidente del solitario (p.ej. la fórmula del supermovimiento) es oro; uno que diga
  `// mueve la carta` es ruido.
- Sin dependencias nuevas sin justificarlas. Cada `npm install` es peso en el APK, superficie de
  ataque y una futura ruptura. La lista de [02](02-arquitectura.md) es la lista.
- ESLint + Prettier en CI. `import/no-cycle` activado.
- Regla `no-restricted-imports`: `core/` y `meta/` no pueden importar de `ui/`, `services/`,
  `app/`, ni de `capacitor`, ni tocar `document`/`window`. **Se verifica automáticamente**;
  no es una convención de honor.
- Prohibido `Math.random()` y `new Date()` fuera de `core/rng.ts` y `services/clock.ts`
  (regla `no-restricted-globals` / `no-restricted-syntax`).

## 3. Pruebas

La pirámide, de abajo arriba:

### 3.1 Unitarias del motor (lo más importante)

Cada regla de [03](03-reglas-de-juego.md) tiene su prueba. Sin excepciones. El motor debe llegar
a **> 90 % de cobertura**, y no por presumir de número: es el único sitio donde un fallo arruina
una partida de 20 minutos.

### 3.2 Pruebas de propiedades (fuzzing)

Con `fast-check`, sobre 1000 semillas aleatorias y partidas jugadas al azar con movimientos legales:

- **Conservación**: en todo momento hay exactamente 52 (o 104) cartas; ninguna duplicada;
  ninguna perdida. *(Esta sola prueba caza la mayoría de los fallos de un motor de solitario.)*
- **Reversibilidad**: `undo(apply(s, m))` es estructuralmente igual a `s`, para todo `m` legal.
- **Legalidad**: aplicar un movimiento que no está en `legalMoves(s)` siempre devuelve error y
  **jamás** modifica el estado.
- **Determinismo**: `deal(seed)` dos veces da lo mismo; reproducir `(seed, moves[])` da el mismo
  estado final, siempre.
- **Ausencia de bloqueo**: si `isWon` es falso e `isStuck` es falso, `legalMoves` no está vacío.

### 3.3 Pruebas doradas (golden)

Ficheros de referencia versionados en `tests/golden/`:

- El reparto de 10 semillas conocidas por juego, serializado. **Si el PRNG o el barajado cambian,
  estas pruebas fallan** — que es exactamente lo que queremos: es la red de seguridad de la
  promesa "el reto de hoy es igual en todos los dispositivos" ([04](04-motor-logico.md) §2).
- Partidas completas grabadas `(seed, moves[])` que deben terminar en victoria.

### 3.4 E2E (Playwright)

Los recorridos que no pueden romperse nunca:

1. Abrir la app → jugar el reto diario → ganarlo → ver la recompensa → la casilla queda marcada.
2. Empezar una partida → matar la app → reabrir → el tablero está exacto.
3. Arrastrar una carta a un destino ilegal → vuelve a su sitio, el estado no cambia.
4. Deshacer 20 movimientos → el estado coincide con el de hace 20 movimientos.
5. Girar la pantalla a mitad de partida → nada se pierde.
6. Exportar los datos → borrar todo → importar → el progreso vuelve idéntico.

### 3.5 Lo que NO se prueba

Píxeles exactos, animaciones, cosmética. Las pruebas de captura de pantalla son frágiles y
gastan más tiempo del que ahorran. Basta con una prueba de que el layout no desborda a 360 px.

## 4. Rendimiento (presupuestos, medidos, no intuidos)

| Métrica | Límite | Cómo se mide |
|---|---|---|
| `applyMove`, `legalMoves` | < 1 ms | benchmark en CI |
| Fotograma durante arrastre | 60 fps sostenidos | DevTools sobre el WebView, dispositivo real |
| Arranque en frío hasta interactuar | < 2 s | medido en gama media, no en el emulador del portátil |
| JS + CSS (gzip) | < 200 kB | `rollup-plugin-visualizer` en CI, falla si se pasa |

**El emulador miente.** Cualquier afirmación de rendimiento se hace sobre un teléfono real de
gama media.

## 5. Accesibilidad

- Contraste AA (4.5:1) en todo el texto.
- Objetivos táctiles ≥ 44 × 44 px (una carta pequeña en una columna apretada puede quedarse
  corta: ampliar la zona de toque **sin** ampliar el dibujo).
- `prefers-reduced-motion` respetado de verdad (duración 0, no "un poco menos").
- Daltonismo: ofrecer el mazo `Accessible` de `assets/cards/`, y no depender **sólo** del color
  para nada (los índices grandes ya ayudan).
- La app funciona sin sonido y sin háptica.
- Etiquetas ARIA en los controles. El tablero completo con lector de pantalla es un objetivo
  loable pero **no** de v1: no prometer lo que no se va a probar.

## 6. Internacionalización

- Español e inglés desde el día 1. Todo texto en ficheros de mensajes; **ni una sola cadena
  literal en un componente**.
- Las fechas se formatean con `Intl`. Los números también.
- Idioma del sistema por defecto, con opción de forzarlo.

## 7. Git y proceso

- Commits pequeños, con mensaje que explique el **porqué**.
- Un motor por rama/PR. Nada de un PR con "los cinco juegos".
- CI en cada push: `typecheck` → `lint` → `test` → `build` → tamaño del bundle. Si algo falla,
  no se mergea.
- El manifiesto de retos diarios (`data/daily/`) se regenera con un job aparte y se revisa como
  un cambio de datos, no de código.

## 8. Errores que NO se van a cometer (lista de peligros conocidos)

Recogidos aquí porque son los que hunden un proyecto de este tipo:

1. **Dejar el empaquetado a Android para el final.** Se hace en la fase 0. Ver [08](08-android-build-y-despliegue.md).
2. **Mezclar la lógica con el DOM.** Se vuelve imposible de probar, y el undo se convierte en
   una pesadilla. Por eso `core/` está aislado por regla de lint.
3. **Mutar el estado.** Rompe el undo, rompe las animaciones y crea fallos de los que no se
   reproducen. El estado es inmutable, y punto.
4. **La regla de grupos de Spider.** Descender vale con cualquier palo, **mover** exige el mismo
   palo. Se implementa mal casi siempre. Tiene prueba dedicada.
5. **La fórmula del supermovimiento de FreeCell**, y su caso especial cuando el destino es una
   columna vacía.
6. **El grafo de cobertura de TriPeaks**, calculado con aritmética en vez de tabulado.
7. **Autocompletar a fundación de forma agresiva**, arruinando partidas ganables. Ver la regla de
   "subida segura" en [04](04-motor-logico.md) §4.
8. **Cambiar el PRNG después de publicar.** Rompe todos los retos históricos. Prueba dorada.
9. **No guardar al pasar a segundo plano.** Android mata el proceso sin avisar; el usuario pierde
   la partida y desinstala.
10. **Usar `left`/`top` en vez de `transform`** para mover cartas: adiós a los 60 fps.
11. **Rutas de assets relativas** en Capacitor. Cartas en blanco en el móvil, y todo bien en el
    escritorio.
12. **Añadir "sólo un" SDK de terceros.** No. Ese es todo el punto del proyecto.
