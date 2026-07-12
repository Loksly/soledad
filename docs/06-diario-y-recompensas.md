# 06 — Retos diarios y recompensas

Este es el corazón de la recurrencia: el motivo por el que se abre la app **hoy** y no
"algún día". Debe funcionar entero **sin conexión** y sin servidor.

## 1. Principio rector

> Recompensar la vuelta, **nunca castigar la ausencia**.

Un juego de solitarios no debe generar ansiedad. La diferencia con el modelo publicitario es
justo esa: aquí el bucle diario existe para dar una razón agradable de volver, no para
extraer sesiones. Consecuencias concretas y obligatorias:

- Perder la racha **no borra** monedas, insignias, niveles ni estadísticas. Sólo reinicia el
  contador de días consecutivos.
- No hay temporizadores ni "vidas". Nunca se le dice a nadie que vuelva mañana porque hoy no
  puede jugar más.
- La notificación diaria (una, local, sin servidor) viene **desactivada por defecto** y jamás
  usa lenguaje de culpa ("¡tu racha está en peligro!"). Texto neutro: "Ya están los retos de hoy".
- No hay cuenta atrás visible presionando a terminar el reto antes de medianoche.

## 2. Retos diarios

### Composición del día

Cada día natural (**hora local**) se ofrecen **5 retos, uno por juego**. Cada uno tiene:

```ts
interface DailyChallenge {
  date: string;              // "2026-07-13"
  game: GameId;
  variant: Variant;          // p.ej. spider 2 palos, klondike robo de 3
  seed: number;              // del manifiesto verificado (ver 04 §5)
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  objective: Objective;      // no siempre es "gana"
  reward: { coins: number; xp: number };
}

type Objective =
  | { kind: 'win' }
  | { kind: 'winUnder', moves: number }
  | { kind: 'winWithin', seconds: number }
  | { kind: 'score', min: number }
  | { kind: 'foundations', count: number }      // parcial: "sube 3 fundaciones"
  | { kind: 'noUndo' }
  | { kind: 'freecellsUnused', max: number };   // sólo FreeCell
```

- La dificultad **rota** a lo largo de la semana (no todos los días son difíciles) y se deriva
  del análisis del solver, no de un número a ojo.
- El objetivo se elige **determinísticamente** a partir de `(fecha, juego)`, igual que la semilla.
  Dos dispositivos ofrecen exactamente lo mismo el mismo día.
- **Siempre hay al menos un reto fácil al día**, para que una sesión de 5 minutos también sume.
- Los retos con objetivo parcial (`foundations`) existen para que Spider a 4 palos o Klondike
  difícil no sean un muro: se puede ganar la recompensa sin ganar la partida.

### Reglas de juego del reto

- El reto se puede **reintentar sin límite** el mismo día (el reparto es el mismo).
- Se puede **abandonar y retomar** más tarde: el estado se guarda como cualquier otra partida.
- Deshacer está permitido, **salvo** en el objetivo `noUndo` (que lo desactiva explícitamente y
  lo avisa antes de empezar).
- Completado el reto, la casilla del día se marca. Volver a jugarlo **no** da más recompensa
  (pero sí actualiza estadísticas y récords).

### Recuperación de días pasados

Los días del **mes en curso** que quedaron sin hacer se pueden jugar después ("recuperar"), y
cuentan para la insignia del mes. **No** cuentan para la racha (la racha es de días consecutivos
jugados *en su día*). Esto respeta a quien pasa tres días sin cobertura o sin ganas, sin
convertir el mes en un fracaso.

Al cambiar de mes, el mes anterior se cierra: ya no se puede recuperar. (Alternativa aceptable:
permitir recuperar hasta 60 días atrás a cambio de monedas; decidirlo en v1.1 con datos reales
de uso propio, no antes.)

## 3. Rachas

```
racha = días naturales consecutivos en los que se completó AL MENOS 1 reto diario
```

- Bonus de racha: `min(50, 5 × racha)` monedas extra al completar el primer reto del día. Con
  tope, para que la racha no se vuelva la única razón de jugar.
- Hitos: 7, 30, 100, 365 días → insignia.
- **Un "salvavidas" al mes**: si se falla un día, la racha se conserva automáticamente una vez
  por mes natural. Sin comprarlo, sin ver un vídeo, sin pedirlo. Simplemente pasa, y se avisa
  con cariño ("Te has saltado ayer; te guardamos la racha").
- La racha máxima histórica se guarda y **nunca** se pierde.

## 4. Economía

| Concepto | Valor |
|---|---|
| Reto fácil | 10 monedas + 20 XP |
| Reto medio | 20 monedas + 40 XP |
| Reto difícil | 35 monedas + 70 XP |
| Reto experto | 50 monedas + 120 XP |
| Los 5 retos del día | +50 monedas de bonus |
| Bonus de racha | `min(50, 5 × racha)` |
| Partida libre ganada | 5 monedas (máx. 25/día, para que el grindeo no tenga sentido) |
| Objetivo del Club de Estrellas | 1 estrella + 25–100 monedas |

- **Nivel** = f(XP), curva suave. El nivel no desbloquea juegos ni ventajas: sólo insignia y
  algún cosmético. Todos los juegos están disponibles desde el minuto uno. Nada se "desbloquea
  jugando" salvo la cosmética.
- Las monedas **sólo** se gastan en cosmética (mazos, reversos, tapetes, temas). Nunca en pistas,
  deshacer, reintentos ni ventajas: eso sería reintroducir la fricción que estamos eliminando.
- **No hay forma de comprar monedas.** Ni con dinero, ni con anuncios, ni con nada.
- Los precios se ajustan para que jugando ~15 min/día se desbloquee algo cada 1–2 semanas.

## 5. Club de Estrellas

Objetivos de largo recorrido, agrupados en "colecciones" por juego. Ejemplos:

- Klondike: *gana 3 partidas con robo de 3* · *gana sin usar deshacer* · *gana en menos de 6 minutos*.
- Spider: *completa una secuencia sin repartir del mazo* · *gana a 2 palos* · *gana a 4 palos*.
- FreeCell: *gana sin usar ninguna celda libre* · *gana en menos de 60 movimientos*.
- Pirámide: *limpia la pirámide sin usar el segundo redeal*.
- TriPeaks: *encadena 10 cartas seguidas* · *limpia los 3 picos*.

Reglas: se progresa **jugando cualquier partida** (libre o diaria); nunca requieren conectividad;
cada colección completada da una insignia y monedas. Sirven para dar objetivo a quien ya hizo
los retos del día — es la retención "profunda" que complementa la diaria.

## 6. Anti-trampas

No hay ranking ni competición, así que **hacer trampas sólo se hace daño a uno mismo**. No se
implementa DRM ni ofuscación. Pero sí se protege al usuario de sí mismo con lo mínimo:

- El progreso se guarda con la marca de tiempo **monótona** del dispositivo además de la fecha
  local. Si el reloj **retrocede**, no se conceden recompensas de días ya recompensados
  (`dailyRewardsClaimed` es un conjunto de fechas: reclamar dos veces el mismo día es
  imposible por construcción, sin necesidad de detectar nada).
- Si el reloj **avanza** (viaje real o trampa), simplemente hay retos nuevos. La racha se
  calcula por fechas consecutivas, así que saltar días la rompe igual. No se persigue al usuario.
- Ninguna comprobación de esto puede bloquear el juego ni requerir red. Un falso positivo que
  impida jugar sería mucho peor que la trampa.

## 7. Pruebas obligatorias

- El reto del 2027-03-03 se genera idéntico con `clock` inyectado, en 100 ejecuciones.
- Todos los repartos del manifiesto están marcados `verified: true` (prueba sobre `data/daily/`).
- Cruzar la medianoche a mitad de partida **no** invalida la partida en curso ni concede el reto
  al día equivocado: el reto se atribuye al día en que **empezó**.
- Cambiar la zona horaria del dispositivo no duplica ni borra recompensas ya reclamadas.
- Racha: día 1..7 → 7; saltar el 8 con salvavidas disponible → sigue 8; saltar dos días → vuelve a 1,
  y `bestStreak` sigue siendo 8.
- Perder la racha no reduce las monedas ni las insignias (prueba explícita de P6).
