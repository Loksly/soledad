# 01 — Visión y alcance

## 1. Problema

Las colecciones de solitarios comerciales para Android tienen un producto correcto envuelto en
publicidad agresiva: vídeos de 30 s antes de una partida, intersticiales al terminar, banners
permanentes y una suscripción para quitarlos. El tiempo de espera por anuncios llega a rivalizar
con el tiempo de juego.

## 2. Visión

> Los mismos juegos, la misma sensación de progreso diario, cero fricción. Abres la app y
> **estás jugando en menos de dos segundos**, siempre, con o sin conexión, para siempre.

## 3. Principios de producto (no negociables)

| # | Principio | Consecuencia práctica |
|---|---|---|
| P1 | **Cero publicidad** | Ninguna dependencia de red de anuncios. Ningún SDK de terceros. |
| P2 | **Cero telemetría** | No se envía nada a ningún servidor. Sin identificadores, sin crash reporting remoto. |
| P3 | **Offline primero** | La app es completamente funcional en modo avión, desde el primer arranque y para siempre. |
| P4 | **Cero espera** | Sin pantallas de carga artificiales, sin "energía", sin cooldowns. Arranque en frío < 2 s. |
| P5 | **El progreso es del usuario** | Todo su historial es exportable a un fichero JSON legible que puede llevarse. |
| P6 | **Recurrencia sin manipulación** | Se premia volver cada día, pero **nunca se castiga** no hacerlo: perder una racha no borra monedas, insignias ni estadísticas. |
| P7 | **Determinista** | El reparto de un día concreto es idéntico en todos los dispositivos, sin servidor. |

## 4. Alcance funcional (MVP + v1)

### 4.1 Juegos (los cinco de la colección)

1. **Klondike** — con robo de 1 o 3 cartas, y modo puntuación.
2. **Spider** — 1, 2 y 4 palos.
3. **FreeCell** — con supermovimientos.
4. **Pirámide** — parejas que suman 13.
5. **TriPeaks** — escalera ±1.

Reglas exactas y normativas en [03-reglas-de-juego.md](03-reglas-de-juego.md).

### 4.2 Bucle de recurrencia diaria

- **Retos diarios**: cada día natural se ofrece un conjunto de partidas concretas, una por
  juego, con objetivos y dificultad crecientes. Todas están **garantizadas como resolubles**.
- **Recompensa por jugar cada día**: monedas + experiencia al completar cada reto, bonus por
  completar todos los del día, y **racha** (días consecutivos) con bonus escalonado.
- **Calendario mensual**: una casilla por día; completar todos los días del mes otorga una
  insignia del mes. Los días pasados del mes en curso **se pueden recuperar** (no se pierde el
  mes por un despiste) — decisión deliberada frente a P6.
- **Club de Estrellas**: colecciones de objetivos de largo recorrido por juego
  ("gana 3 Spider a 4 palos", "termina un FreeCell sin usar celdas libres"), que otorgan estrellas.
- **Recompensas cosméticas**: las monedas se gastan **sólo** en cosmética — reversos de carta,
  tapetes, y las variantes del mazo ya presentes en `assets/cards/` (Vertical2, Vertical4,
  Horizontal2, Horizontal4, Accessible). Nunca en ventajas de juego.

Detalle en [06-diario-y-recompensas.md](06-diario-y-recompensas.md).

### 4.3 Partida libre

Cualquier juego, cualquier variante, en cualquier momento, con semilla aleatoria o introducida
a mano ("jugar el reparto n.º 12345"). También cuenta para estadísticas y Club de Estrellas,
pero **no** para el reto diario.

### 4.4 Calidad de vida

- Deshacer ilimitado (y rehacer), gratis, sin coste ni penalización.
- Pistas.
- Autocompletado cuando la partida está ganada.
- Guardado automático: cerrar la app a media partida y volver deja el tablero intacto.
- Estadísticas por juego: partidas, victorias, % de victorias, mejor tiempo, menos movimientos,
  racha actual y máxima.
- Temas claro/oscuro, zurdo/diestro, tamaño de carta, animaciones reducibles.
- Español e inglés.

### 4.5 Nube opcional

Copia de seguridad **opt-in y desactivada por defecto** de preferencias y progreso.
Ver [07-persistencia-y-sync.md](07-persistencia-y-sync.md). Sin cuenta obligatoria. Sin
funcionalidad degradada al no usarla.

## 5. No-objetivos (explícitamente fuera)

- Multijugador, ranking global, amigos, chat, redes sociales.
- Cuentas de usuario, login obligatorio, servidor propio.
- Compras integradas, moneda premium, cofres, gacha.
- Anuncios de cualquier tipo, incluidos "recompensados".
- Notificaciones push desde un servidor. (Sí se permite **una** notificación local diaria,
  desactivada por defecto, configurable — ver P6.)
- Otros solitarios (Golf, Yukon, Canfield…) en v1. La arquitectura debe permitir añadirlos
  después sin tocar el núcleo, pero no se implementan.

## 6. Métricas de éxito (medibles localmente, no reportadas)

- Tiempo desde el toque en el icono hasta poder mover una carta: **< 2 s** en un gama media de 2019.
- Tamaño del APK: **< 15 MB**.
- 60 fps sostenidos durante el arrastre y las animaciones en gama media.
- 0 permisos de Android peligrosos. 0 permiso `INTERNET` en la variante base.
- 100 % de los repartos diarios verificados resolubles antes de publicarse.

## 7. Público

Persona única: alguien que juega 10–20 minutos al día, a menudo sin conexión (metro, avión),
que quiere la misma progresión diaria que le engancha en las apps comerciales pero sin pagar
con su tiempo y su atención.
