# Soledad

Los cinco solitarios clásicos (Klondike, Spider, FreeCell, Pirámide y TriPeaks) con retos
diarios y progresión, **sin publicidad, sin telemetría, sin compras y sin cuenta**. Funciona
entero en modo avión, desde el primer arranque y para siempre.

La variante base **ni siquiera pide el permiso `INTERNET`** de Android. No es una promesa: es un
hecho que puedes comprobar tú mismo con `aapt dump permissions` sobre el APK, o con
`./scripts/verify-apk.sh`.

## Cómo se juega esto

```bash
npm install
npm run dev          # navegador, ciclo rápido
```

## Cómo se construye el APK

```bash
npm run apk:debug    # → android/app/build/outputs/apk/debug/app-debug.apk
./scripts/verify-apk.sh                      # comprueba permisos y tamaño
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Necesitas el SDK de Android (build-tools + platform 34) y `ANDROID_HOME` apuntando a él.

## Cómo está hecho

TypeScript estricto + Vite + Preact, empaquetado con Capacitor. El motor de juego es puro,
determinista y no sabe que existe un navegador.

```
src/core/      Cartas, mazo, RNG, los 5 motores, undo, solver.   Puro. Sin DOM, sin red, sin fecha.
src/meta/      Retos diarios, recompensas, rachas, estadísticas.  Puro y determinista.
src/services/  Persistencia, reloj, i18n, sonido, háptica.        Los efectos, tras interfaces.
src/app/       Sesión de partida, autoguardado, ciclo de vida.
src/ui/        Preact: tablero, pantallas, geometría responsive.
```

Las flechas de dependencia apuntan **sólo hacia abajo**, y no por buena voluntad: hay reglas de
ESLint que rompen la build si `core/` toca el DOM, importa Capacitor, o llama a `Math.random()`
o `new Date()`. El azar entra por una semilla; la fecha, por `services/clock.ts`.

### Las tres ideas que sostienen el proyecto

**1. Una partida es `(semilla, movimientos[])`.** El estado del tablero nunca se serializa: se
reproduce. De ahí salen gratis el deshacer ilimitado, el guardado de unas decenas de bytes, la
reanudación exacta tras un cierre forzoso, y la depuración de un fallo reportado.

**2. El reparto de un día es idéntico en todos los dispositivos, sin servidor.** El PRNG
(`mulberry32`) y el barajado están **congelados por contrato**: hay pruebas doradas
(`tests/golden/`) que fallan si alguien los toca, porque tocarlos cambiaría retroactivamente
todos los retos ya jugados.

**3. Ningún reto diario es imposible.** Un solver los resuelve **en tiempo de compilación** y
escribe las semillas verificadas en `data/daily/manifest.json`. El móvil sólo lee ese número:
cero CPU, cero batería, cero red.

```bash
npm run dailies -- --from 2026-01-01 --to 2036-12-31   # se ejecuta en CI, no en el móvil
```

`data/daily/manifest.json` trae hoy **365 días, 1825 retos, el 100 % verificados**. El manifiesto
viaja como asset estático, no dentro del bundle de JS: a diez años son ~1,5 MB de JSON y se
comerían el presupuesto. Las fechas que se salgan de él no rompen nada — la semilla se deriva de
la fecha y el reto se marca como no verificado.

## Comprobarlo todo

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run size
```

- **190 pruebas**: reglas de los cinco juegos, propiedades con fuzzing (conservación de cartas,
  reversibilidad del undo, legalidad, determinismo), doradas (repartos y partidas ganadas
  grabadas), persistencia (JSON corrupto, migraciones) y layout (que no desborde a 360 px).
- **Presupuestos**: bundle < 200 kB gzip (va por 52), APK < 15 MB, `applyMove` < 1 ms.

## Lo que este proyecto no tiene, y no va a tener

Publicidad. Telemetría. Analítica. Crash reporting remoto. Identificadores de usuario. Cuentas.
Compras. Moneda premium. Energía. Vidas. Cooldowns. Cofres. Notificaciones desde un servidor.
SDKs de terceros.

Las monedas se ganan jugando y **sólo** se gastan en cosmética. No hay forma de comprarlas: ni
con dinero, ni con anuncios, ni con nada. Deshacer es ilimitado y gratis.

Y perder la racha no borra ni una moneda: se premia volver, nunca se castiga faltar. Hay una
prueba automática que lo verifica, porque es un principio, no una preferencia.

## Créditos y aviso legal

Las cartas son de **[SVG-cards, de Saul Spatz](https://github.com/saulspatz/SVG-cards)**, en
**dominio público**. La atribución completa —incluidas las figuras de Byron Knoll y los reversos
de openclipart.org— está en **[CREDITS.md](CREDITS.md)**, y también dentro de la propia app.

Klondike, Spider, FreeCell, Pirámide y TriPeaks son solitarios clásicos de **dominio público**:
sus reglas llevan más de un siglo en circulación y **las mecánicas de juego no son protegibles por
copyright**. Sus nombres son genéricos, no marcas.

Este proyecto **no usa ninguna marca, logotipo, arte, sonido, texto ni línea de código de ninguna
empresa**. Todo el código es original y hay una prueba automática
([`tests/unit/legal.spec.ts`](tests/unit/legal.spec.ts)) que falla si se cuela una marca ajena.

Licencia del código: **[GPL-3.0-or-later](LICENSE)**. La GPL es deliberada: la promesa de "sin
publicidad y sin telemetría" sólo vale algo si nadie puede coger esto, meterle un SDK de anuncios
y repartirlo a puerta cerrada.
