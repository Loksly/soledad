# Créditos y atribución

## Las cartas

Las 324 imágenes de cartas que se distribuyen con esta aplicación derivan de **[SVG-cards](https://github.com/saulspatz/SVG-cards)**,
de **[Saul Spatz](https://github.com/saulspatz)**.

> *"Everything in this repository has been placed by the author in the public domain. You can
> copy, modify, distribute, fold, spindle, and mutilate the work, even for commercial purposes,
> all without asking permission."*
> — [SVG-cards, README](assets/README.md)

Están en **dominio público**. No exigen atribución: la damos igual, porque encontrar cartas de
dominio público con índices grandes —justo lo que un solitario necesita— cuesta, y quien hizo ese
trabajo merece que se le nombre.

El propio autor documenta el origen de las partes que él no dibujó, y lo reproducimos porque la
cadena de atribución se corta si no:

| Elemento | Origen | Estado |
|---|---|---|
| Figuras (J, Q, K) | [Juego de cartas de Byron Knoll](https://commons.wikimedia.org/wiki/Category:Playing_cards_set_by_Byron_Knoll), en Wikimedia Commons | Dominio público |
| Reversos | [openclipart.org](https://openclipart.org) | Dominio público |
| Comodines | Byron Knoll, en Wikimedia Commons — **no se usan en este juego** | Dominio público |
| Índices, palos, composición y variantes de color | Saul Spatz | Dominio público |

### Qué hacemos nosotros con ellas

Los SVG originales están en [`assets/cards/`](assets/cards/), **intactos y sin modificar**. Son la
fuente de verdad. En el momento de compilar, [`scripts/prepare-assets.ts`](scripts/prepare-assets.ts)
los optimiza con SVGO y los rasteriza a WebP a 390 × 585 px: una sola figura pesa hasta 744 kB en
SVG, y precargar el mazo entero se cargaba el arranque de la app. Sólo cambia el formato; el dibujo
es el mismo.

## Las reglas de los juegos

Klondike, Spider, FreeCell, Pirámide y TriPeaks son solitarios **clásicos y de dominio público**.
Sus reglas llevan en circulación desde el siglo XIX (los tres primeros) y desde los años ochenta
(los dos últimos), y **las mecánicas de juego no son protegibles por copyright**. Sus nombres son
genéricos, no marcas.

Este proyecto **no usa ninguna marca, logotipo, arte, sonido, texto ni línea de código de ninguna
empresa**. Todo el código es original y se ha escrito para este repositorio.

## Dependencias

Ninguna de ellas se distribuye dentro de la aplicación con requisitos de atribución incompatibles
con la GPL-3.0. Todas son de licencia permisiva:

| Dependencia | Licencia | Para qué |
|---|---|---|
| [Preact](https://preactjs.com) + Signals | MIT | Interfaz |
| [Capacitor](https://capacitorjs.com) | MIT | Empaquetado Android |
| [Zod](https://zod.dev) | MIT | Validación de todo dato externo |
| [idb](https://github.com/jakearchibald/idb) | ISC | IndexedDB |
| [Vite](https://vitejs.dev), [Vitest](https://vitest.dev), [ESLint](https://eslint.org), [Prettier](https://prettier.io), [TypeScript](https://www.typescriptlang.org) | MIT / Apache-2.0 | Sólo desarrollo: no van en el APK |
| [SVGO](https://github.com/svg/svgo), [sharp](https://sharp.pixelplumbing.com) | MIT / Apache-2.0 | Sólo build: no van en el APK |

**Cero SDKs de terceros en tiempo de ejecución.** Ni analítica, ni publicidad, ni crash reporting,
ni nada. Es el punto entero del proyecto, y se puede auditar: la variante base ni siquiera declara
el permiso `INTERNET` de Android.

## Este proyecto

Código: **GPL-3.0-or-later** (ver [LICENSE](LICENSE)).

La GPL obliga a que cualquiera que distribuya una versión modificada publique su código. Es
deliberado: la promesa de "sin publicidad y sin telemetría" sólo vale algo si nadie puede coger
esto, meterle un SDK de anuncios y repartirlo a puerta cerrada.
