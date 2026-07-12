# 10 — Roadmap

Orden estricto. **No se pasa de fase sin cumplir todos sus criterios de aceptación**, que están
escritos para ser verificables, no opinables.

El orden está elegido para que los riesgos grandes (¿arranca en Android?, ¿son correctas las
reglas?) se maten **pronto**, y lo cómodo (cosmética, pulido) quede para el final.

---

## Fase 0 — Esqueleto que llega al teléfono

Nada de juego todavía. Sólo el camino completo del código al dispositivo.

- Proyecto Vite + TS `strict` + Preact + Vitest + ESLint + Prettier.
- Capacitor configurado, carpeta `android/` generada.
- Una pantalla que dibuje **una** carta SVG desde `assets/cards/Vertical2/svgs/`.
- CI: typecheck + lint + test + build.

**Aceptación**
- [ ] `npm run apk:debug` produce un APK que se instala en un móvil real y muestra la carta.
- [ ] La carta se ve (rutas de assets correctas **en el dispositivo**, no sólo en Chrome).
- [ ] El manifiesto **no** declara el permiso `INTERNET` (`aapt dump permissions` lo demuestra).
- [ ] La regla de lint que prohíbe importar el DOM desde `core/` existe y falla si se viola.

> Si la fase 0 no se supera, no se escribe ni una línea de motor. Todo lo demás depende de esto.

---

## Fase 1 — Núcleo y Klondike

- `core/card.ts`, `deck.ts`, `rng.ts`, `types.ts`, `engine.ts`, `history.ts`.
- `core/games/klondike.ts` completo, según [03](03-reglas-de-juego.md) §1.
- Pruebas unitarias + de propiedades + doradas del reparto.
- **Sin interfaz**: se juega desde los tests.

**Aceptación**
- [ ] Todas las pruebas de la tabla de [03](03-reglas-de-juego.md) §6 para Klondike, en verde.
- [ ] Conservación de cartas y reversibilidad del undo, con fuzzing de 1000 semillas.
- [ ] `deal(12345)` produce el mismo tablero en 100 ejecuciones y coincide con el fichero dorado.
- [ ] `applyMove` < 1 ms.

---

## Fase 2 — Tablero jugable

- Renderizado con `<img>` (o sprite) + posicionado con `transform`.
- Layout responsive calculado en TS; vertical y horizontal.
- Arrastrar y soltar con Pointer Events, imán, resaltado de destinos, retorno animado.
- Toque inteligente, deshacer/rehacer, animaciones FLIP.
- Guardado automático de la partida en curso.

**Aceptación**
- [ ] Klondike se juega de principio a fin **en el móvil**, con el dedo, sin fallos.
- [ ] 60 fps durante el arrastre en un dispositivo real de gama media.
- [ ] Rotar la pantalla a mitad de partida no pierde nada.
- [ ] Matar la app y reabrirla restaura el tablero exacto.
- [ ] El tablero no desborda a 360 px de ancho ni en una tablet de 1280 px.
- [ ] Botón atrás → menú de pausa, nunca salida con pérdida.

> **Este es el punto en el que el proyecto ya es útil.** Un Klondike jugable sin anuncios ya
> cumple la promesa. Todo lo que sigue lo amplía.

---

## Fase 3 — Los otros cuatro juegos

Uno por uno, en este orden (de menos a más traicionero):
**FreeCell → Spider → TriPeaks → Pirámide.**

Cada uno: motor + pruebas + su disposición en el tablero. Cada uno debe entrar **sin tocar
`ui/board/` ni la persistencia** — si hay que tocarlas, la abstracción de la fase 1 estaba mal y
se arregla ahí, no con un parche.

**Aceptación**
- [ ] Los cinco juegos pasan la tabla de pruebas de [03](03-reglas-de-juego.md) §6.
- [ ] La fórmula del supermovimiento de FreeCell, con sus casos límite, verificada.
- [ ] En Spider, mover un grupo de palos mezclados es imposible; repartir con columna vacía es imposible.
- [ ] El grafo de cobertura de TriPeaks está tabulado y verificado.
- [ ] Añadir un juego requirió sólo un fichero en `core/games/` + registro + layout.

---

## Fase 4 — Solver y retos diarios

- Solvers de [04](04-motor-logico.md) §5.
- `scripts/generate-dailies.ts` → manifiesto en `data/daily/` para 10 años.
- `meta/daily.ts`, `rewards.ts`, `streak.ts`, `stats.ts`.
- Pantallas de retos diarios (calendario) y estadísticas.

**Aceptación**
- [ ] El 100 % de los repartos del manifiesto están verificados como resolubles.
- [ ] El reto de una fecha dada es idéntico en dos dispositivos distintos, en modo avión.
- [ ] Cruzar la medianoche a mitad de partida no rompe la atribución del reto.
- [ ] La app **no** ejecuta el solver en el dispositivo (comprobado: sin picos de CPU al abrir).
- [ ] Perder la racha no reduce monedas ni insignias (prueba explícita de P6).

---

## Fase 5 — Progresión, cosmética y pulido

- Club de Estrellas, insignias, niveles, tienda cosmética.
- Temas, tapetes, mazos (aprovechando las 5 variantes de `assets/cards/`).
- Sonido, háptica, i18n es/en, ajustes completos.
- Exportar/importar datos ([07](07-persistencia-y-sync.md) §3).
- Notificación local diaria (desactivada por defecto).

**Aceptación**
- [ ] Exportar → borrar datos → importar devuelve el progreso idéntico.
- [ ] Un JSON corrupto no tumba la app ni corrompe el estado.
- [ ] Todos los textos están traducidos; no queda ninguna cadena literal en el código.
- [ ] APK < 15 MB. Arranque < 2 s en gama media.

---

## Fase 6 — Publicación

- Licencia (GPL-3.0 o MIT), README, capturas, metadatos de F-Droid.
- Build de release firmado y reproducible.
- Repaso legal: ningún nombre, icono ni texto que evoque a una marca registrada ajena.

**Aceptación**
- [ ] APK de release firmado, instalable, funcionando en modo avión desde la primera apertura.
- [ ] Auditoría de permisos: sólo `VIBRATE` (y `POST_NOTIFICATIONS` si se activó).
- [ ] Cero peticiones de red durante una sesión completa (verificado con un proxy o `tcpdump`).

---

## Fase 7 (opcional) — Nube

- `SyncProvider` + Google Drive `appDataFolder` y/o WebDAV, en el **flavor `cloud`**.
- Fusión de blobs según [07](07-persistencia-y-sync.md) §4.

**Aceptación**
- [ ] La variante `base` sigue compilando y pasando todos los tests **sin** el módulo de sync.
- [ ] Fusionar dos dispositivos con progresos distintos no pierde ni un día completado.
- [ ] Un fallo de red nunca bloquea el juego ni muestra un modal encima del tablero.

---

## Deliberadamente después de la v1

Sólo si el proyecto sigue vivo y apetece: más solitarios (Golf, Yukon, Canfield, Forty Thieves),
estadísticas avanzadas, replays compartibles como texto, versión de escritorio (Electron/Tauri),
lector de pantalla completo en el tablero.
