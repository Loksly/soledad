# 05 — UI / UX

> Este documento **sustituye y corrige** a [ui.md](ui.md), que se conserva por historia.
> **Corrección importante:** `ui.md` supone nombres como `heart_A.svg` o `club_K.svg`.
> **Esos ficheros no existen.** La convención real del repositorio de cartas es la de §1.

## 1. Assets de cartas (comprobado contra el repositorio)

Ruta: `assets/cards/{Variante}/svgs/`, con `Variante ∈ {Vertical2, Vertical4, Horizontal2,
Horizontal4, Accessible/Vertical, Accessible/Horizontal}`.

Nombres reales de fichero — **camelCase, sin guión bajo, con el valor escrito en palabra**:

```
club2.svg … club10.svg, clubJack.svg, clubQueen.svg, clubKing.svg, clubAce.svg
diamond2.svg … diamondAce.svg
heart2.svg … heartAce.svg
spade2.svg … spadeAce.svg
blueBack.svg, redBack.svg        ← reversos
blackJoker.svg, redJoker.svg     ← NO se usan
sprite.svg, sprite.png           ← hoja de sprites de las 54
```

Los SVG individuales miden **210 × 315 px** (relación 2:3). Esa relación es una constante del
proyecto: `const CARD_ASPECT = 315 / 210;`

```ts
// ui/board/cardSrc.ts — ÚNICO sitio donde se construye una ruta de carta.
const RANK_NAME: Record<Rank, string> = {
  1:'Ace', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10',
  11:'Jack', 12:'Queen', 13:'King',
};
export const cardSrc = (c: Card, deck: DeckStyle): string =>
  c.faceUp
    ? `/assets/cards/${deck.folder}/svgs/${c.suit}${RANK_NAME[c.rank]}.svg`
    : `/assets/cards/${deck.folder}/svgs/${deck.back}.svg`;
```

**Antes de escribir código, el implementador debe listar el directorio y verificar que estos
nombres son los correctos.** Una ruta rota se ve como una carta en blanco, y con 52 cartas es
un fallo caro de depurar tarde.

### Rendimiento de carga

52 `<img>` a 52 SVG distintos son 52 peticiones. En Capacitor son locales (rápidas), pero aun
así:

- **Precarga obligatoria** de las 54 imágenes en la pantalla de arranque antes de mostrar el
  tablero. Un mazo que "aparece por trozos" es inaceptable.
- Alternativa preferida: `scripts/build-sprite.ts` genera **un** SVG con `<symbol id="spadeAce">…`
  y la carta se pinta con `<svg><use href="#spadeAce"/></svg>`. Una sola descarga, coloreable
  por CSS, y el navegador no hace 52 decodificaciones. **Medir ambas** y quedarse con la que
  arranque más rápido; documentar la decisión.
- Las variantes de mazo (Vertical4, Accessible…) se cargan **bajo demanda**, sólo si el usuario
  las selecciona. No entran en el arranque.

## 2. Renderizado

- **DOM + CSS `transform`**. Nada de Canvas (ver [02](02-arquitectura.md)).
- Cada carta es **un solo nodo** posicionado con `transform: translate3d(x, y, 0)` en un
  contenedor con `position: relative`. **Nunca** `left`/`top`: fuerzan *layout*; `transform` va
  a la GPU.
- La carta lleva `key={card.id}` (por eso el `id` de [04](04-motor-logico.md) es obligatorio):
  así, mover una carta entre pilas **reposiciona el mismo nodo**, en vez de destruir uno y crear
  otro — que es lo que impide animar.
- `will-change: transform` sólo mientras se arrastra, no de forma permanente (agota memoria de GPU).
- El repintado es una función pura del estado: `render(state)`. Ningún componente muta el tablero.

### Animaciones (FLIP)

Cuando el estado cambia, la posición de destino de cada carta se calcula con el layout, y la
transición se hace con la técnica FLIP (`First, Last, Invert, Play`): se aplica la transformación
inversa y se deja que el navegador anime a la posición final.

- Movimiento de carta: **180 ms**, `cubic-bezier(.2,.8,.2,1)`.
- Volteo: rotación en Y, 160 ms.
- Reparto inicial: escalonado de 20 ms por carta, **saltable con un toque** (nadie quiere ver la
  animación de reparto por 400.ª vez).
- Autocompletado: 60 ms por carta.
- **`prefers-reduced-motion: reduce` → todas las duraciones a 0.** Obligatorio, no opcional.

## 3. Layout responsive

El requisito es que el tablero **nunca** se desborde ni se solape mal, desde un móvil pequeño
en vertical hasta una tablet en horizontal.

La geometría se calcula en TypeScript (`ui/layout/`), **no** con media queries a ojo:

```ts
interface Layout { cardW: number; cardH: number; gapX: number; fanY: number; origin: Point; }
function computeLayout(game: GameId, viewport: Size, safeArea: Insets): Layout
```

Reglas:

1. `cardW = min( (ancho_disponible − gaps) / columnas , (alto_disponible) / alto_maximo_necesario / CARD_ASPECT )`.
   Es decir: **el ancho de carta lo dicta la dimensión más restrictiva**, y todo lo demás se
   deriva de él. Nunca se fija un tamaño en `px`.
2. **Solapamiento adaptativo (`fanY`)**: en una columna larga de Spider (hasta ~20 cartas), el
   desplazamiento vertical entre cartas se **reduce dinámicamente** para que la columna quepa,
   con un mínimo legible (debe verse el índice de la esquina). Si ni con el mínimo cabe, la
   columna se hace *scrollable*. Es preferible aquí el mazo **Horizontal2/4**, cuyos índices
   laterales permiten un solapamiento más apretado (por eso existe esa variante, ver
   [assets/README.md](../assets/README.md)).
3. **Vertical vs horizontal**: no es un escalado, es una **reorganización**. En vertical,
   mazo/descarte/fundaciones van arriba en una barra; en horizontal, las fundaciones pueden ir
   a un lateral, dejando más altura a las columnas. Cada juego declara sus dos disposiciones.
4. **Safe areas**: `env(safe-area-inset-*)` para *notch* y barra de gestos. La app va
   edge-to-edge, pero ninguna carta queda bajo el notch.
5. **Zona de pulgar**: en vertical, los controles (deshacer, pista, menú) van **abajo**, no
   arriba: la mano de quien juega en el metro llega ahí. Opción "zurdo/diestro" que los
   espeja.
6. Se prueba en, al menos: 360×640, 412×915, 1280×800 (tablet), y en ambas orientaciones.

## 4. Interacción

Tres formas de mover, y las tres deben funcionar:

1. **Arrastrar y soltar** (Pointer Events, no Touch Events: unifican ratón/dedo/lápiz).
   - `touch-action: none` en el tablero para que el navegador no robe el gesto con su scroll.
   - **Umbral de 8 px** antes de considerar que es un arrastre — si no, un toque tembloroso se
     convierte en arrastre fallido.
   - La carta arrastrada se eleva a una **capa de arrastre** por encima de todo, con sombra y
     una escala del 1,05.
   - **Destinos válidos resaltados** en cuanto empieza el arrastre. Esto es calidad de vida pura
     y es lo que separa una app agradable de una frustrante.
   - **Soltar con imán**: si el centro de la carta cae a menos de ~40 % del ancho de carta de un
     destino legal, se acepta. El dedo es gordo y tapa la carta; ser estricto aquí se siente como
     un fallo del juego.
   - Soltar en un destino ilegal: la carta **vuelve animada** a su origen (250 ms). Nunca se queda
     tirada ni se pierde.
2. **Toque simple** = `autoMove` (ver [04](04-motor-logico.md) §4). Es el gesto que más se usa;
   debe ser instantáneo.
3. **Doble toque** = enviar a fundación si es posible. (Configurable: hay quien prefiere que el
   toque simple no autocomplete.)

Otros:
- Toque en el mazo = robar. Toque en el mazo vacío = redeal (si queda alguno; si no, sacude
  el mazo con una animación de "no" en vez de no hacer nada en silencio).
- **Nunca** hay un movimiento que el jugador no pueda deshacer.
- Retroalimentación **háptica** ligera (10 ms) al soltar una carta válida y al completar una
  fundación. Desactivable.
- **Sonido**: efectos cortos (carta, victoria). Silenciados por defecto si el móvil está en
  silencio. Toda la app funciona sin sonido.
- **Botón atrás de Android**: dentro de una partida abre el menú de pausa; **nunca** cierra la
  app perdiendo la partida.

## 5. Pantallas

1. **Inicio** — Retos de hoy arriba (lo primero que se ve), rejilla de los 5 juegos debajo, y
   una tarjeta de "Continuar partida" si la hay. Nada más. Sin carrusel de novedades, sin
   promociones, sin banners.
2. **Tablero** — el juego, más una barra mínima (deshacer, pista, menú, cronómetro/puntuación
   ocultables).
3. **Retos diarios** — calendario mensual, racha, progreso.
4. **Club de Estrellas** — objetivos por juego.
5. **Estadísticas** — por juego.
6. **Ajustes** — tema, mazo, tapete, animaciones, sonido, háptica, zurdo/diestro, idioma,
   exportar/importar datos, sincronización opcional.
7. **Tienda cosmética** — se gastan monedas en mazos, reversos y tapetes. **Sin dinero real.**
   Nada de la tienda afecta a la jugabilidad.

## 6. Estética

- Tapete verde clásico por defecto; temas claro/oscuro que respetan la preferencia del sistema.
- Tipografía del sistema (no se descargan fuentes: pesan y son una petición de red).
- Sin *skeuomorfismo* excesivo, sin partículas por todas partes. La celebración de victoria es
  breve (2 s) y **se puede saltar tocando**.
- El contraste de todo texto cumple WCAG AA (4.5:1). El mazo `Accessible` existe precisamente
  para daltonismo: ofrecerlo en ajustes, con explicación.
