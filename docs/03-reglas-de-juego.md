# 03 — Reglas de juego (especificación normativa)

Este documento es la **fuente de la verdad**. Los detalles ambiguos de un solitario son la
primera causa de defectos: aquí no queda ninguno abierto. Cada regla es comprobable con una
prueba unitaria.

## 0. Convenciones comunes

- **Palos**: `spade` ♠, `heart` ♥, `diamond` ♦, `club` ♣.
- **Colores**: ♠♣ negro; ♥♦ rojo.
- **Valores**: `A`(1), `2`…`10`, `J`(11), `Q`(12), `K`(13). Los comodines **no se usan**.
- **Fundación (foundation)**: pila destino donde se acumulan las cartas ganadas.
- **Tablero (tableau)**: las columnas de juego.
- **Mazo/robo (stock)** y **descarte (waste)**.
- **Secuencia descendente**: cada carta vale uno menos que la de debajo.
- **Sin envoltura de valor** (K no sigue a A) **salvo que se diga explícitamente** — sólo
  TriPeaks la tiene, y es configurable.
- Voltear una carta que queda descubierta boca abajo es **automático**, pero se registra
  como parte del movimiento para que deshacer la restaure boca abajo.

## 1. Klondike

**Mazo**: 1 baraja (52). **Fundaciones**: 4 (una por palo). **Tablero**: 7 columnas.

### Reparto
Columna *i* (1…7) recibe *i* cartas; sólo la última queda boca arriba. Total 28. Las 24
restantes forman el mazo boca abajo. Descarte vacío.

### Movimientos legales
- **Robar**: pasa 1 o 3 cartas (según variante) del mazo al descarte, boca arriba. Si la
  variante es de 3 y quedan menos de 3, se pasan las que haya.
- **Redeal**: mazo vacío → el descarte vuelve al mazo **conservando el orden** (se voltea el
  montón entero, sin barajar). Límite de pasadas: **ilimitado en robo de 1, ilimitado en robo
  de 3** por defecto; configurable a 3 pasadas para el modo "difícil".
- **A fundación**: sólo el As si la fundación está vacía; si no, la carta del mismo palo y
  valor inmediatamente superior. Sólo de una en una, desde el descarte o desde la cima de una
  columna. Nunca varias.
- **A tablero**: una carta (o una secuencia ya ordenada de cartas boca arriba) se coloca sobre
  una carta boca arriba de **color contrario** y **valor uno mayor**. Una secuencia se mueve
  entera sólo si es descendente y alterna colores.
- **Columna vacía**: sólo la acepta un **K** (o una secuencia que empiece por K).
- **De fundación a tablero**: **permitido** (a veces es necesario para ganar). Descuenta puntos
  en el modo puntuación.

### Victoria
Las 52 cartas en las fundaciones.

### Atasco
Sin movimientos legales, mazo y descarte vacíos (o el redeal no produce ningún movimiento nuevo,
lo que se detecta si tras una pasada completa no se ha hecho ningún movimiento).

### Puntuación (modo "estándar", opcional)
`+10` carta a fundación, `+5` carta del descarte al tablero, `+5` voltear carta del tablero,
`-15` de fundación a tablero, `-100` por redeal a partir del segundo (robo de 1). El
cronómetro nunca resta: el jugador no debe sentir prisa (P4).

## 2. Spider

**Mazo**: 2 barajas (104 cartas). **Tablero**: 10 columnas. **Fundaciones**: 8 (huecos para
secuencias completas).

### Variantes
- **1 palo**: 8 barajas de picas. **2 palos**: picas y corazones ×4. **4 palos**: 2 barajas
  completas.

### Reparto
54 cartas al tablero: las **4 primeras columnas reciben 6** cartas, las **6 restantes reciben 5**.
Sólo la última de cada columna queda boca arriba. Las **50** restantes son el mazo.

### Movimientos legales
- **A tablero**: una carta se coloca sobre otra de **valor uno mayor, sea cual sea el palo**.
  Pero un **grupo** de cartas sólo se mueve si es una secuencia **descendente y del mismo palo**.
  (Esta asimetría es la esencia del juego. Es el error más frecuente al implementarlo.)
- **Columna vacía**: acepta **cualquier** carta o secuencia válida.
- **Repartir del mazo**: reparte **1 carta boca arriba a cada una de las 10 columnas**.
  **Prohibido si alguna columna está vacía.** Hay exactamente 5 repartos.
- **No hay descarte** ni movimientos a fundación manuales.

### Fundación
Cuando se completa `K,Q,J,10,9,8,7,6,5,4,3,2,A` del **mismo palo** en una columna, se retira
**automáticamente** a una fundación y se voltea la carta que quede debajo. Se registra como
movimiento para poder deshacerlo.

### Victoria
Las 8 secuencias completadas.

### Atasco
Ningún movimiento en el tablero y mazo agotado (o hay columna vacía que impide repartir y no
hay forma de rellenarla).

## 3. FreeCell

**Mazo**: 1 baraja. **Tablero**: 8 columnas. **Celdas libres**: 4. **Fundaciones**: 4.

### Reparto
Todas las cartas **boca arriba**. Columnas 1–4: 7 cartas. Columnas 5–8: 6 cartas. (52 = 4·7 + 4·6.)
No hay mazo ni descarte. **No hay información oculta**: toda partida es analizable, y ~99,999 %
de los repartos son resolubles.

### Movimientos legales
- **Celda libre**: acepta **una** carta (la cima de una columna). De la celda se puede sacar a
  fundación o a tablero.
- **A tablero**: sobre carta de **color contrario** y **valor uno mayor**.
- **Columna vacía**: acepta **cualquier** carta.
- **A fundación**: por palo, ascendente desde el As. De fundación a tablero: **permitido**.

### Supermovimiento
Formalmente sólo se mueve una carta a la vez, pero la interfaz debe permitir arrastrar una
secuencia (descendente, colores alternos) y realizar los movimientos intermedios sola. El
máximo de cartas movibles es:

```
(celdas_libres + 1) × 2 ^ (columnas_vacías)
```

y si la columna **destino está vacía**, esa columna vacía no cuenta:

```
(celdas_libres + 1) × 2 ^ (columnas_vacías − 1)
```

El motor **debe** implementar esta fórmula exactamente; es la regla que más se implementa mal.
Un supermovimiento se registra como **un solo** movimiento deshacible.

### Victoria
Las 52 cartas en fundación.

## 4. Pirámide

**Mazo**: 1 baraja. **Tablero**: pirámide de 7 filas (1+2+…+7 = **28** cartas), boca arriba.
**Mazo de robo**: 24. **Descarte**: 1 visible.

### Cobertura
Una carta de la pirámide es **jugable** sólo si sus **dos** cartas inferiores adyacentes ya se
han retirado. La fila 7 (base) empieza siempre jugable.

### Valores
`A`=1, `2`…`10` = su valor, `J`=11, `Q`=12, `K`=13.

### Movimientos legales
- **Retirar un K**: un rey jugable se retira **solo**.
- **Retirar una pareja que sume 13**: A+Q, 2+J, 3+10, 4+9, 5+8, 6+7. Las dos cartas deben ser
  jugables. Las parejas pueden combinar: pirámide+pirámide, pirámide+descarte, o
  descarte+descarte (la carta visible del descarte con la que quedó debajo — **sólo si la
  variante lo permite; por defecto NO**: la carta del descarte sólo empareja con una de la
  pirámide o con la carta recién robada).
- **Robar**: pasa 1 carta del mazo al descarte.
- **Redeal**: mazo vacío → el descarte vuelve al mazo, sin barajar. **Máximo 2 redeals**
  (3 pasadas en total). Configurable.

### Victoria
Las 28 cartas de la pirámide retiradas. Las cartas que queden en mazo/descarte **no importan**.

### Atasco
No hay pareja posible ni rey jugable, y no quedan robos ni redeals.

## 5. TriPeaks

**Mazo**: 1 baraja. **Tablero**: 3 picos, **28** cartas. **Mazo**: 23. **Descarte**: 1 carta
visible (el "montón activo").

### Disposición exacta
- Cada pico: 1 carta (fila 0) + 2 (fila 1) + 3 (fila 2) = 6 cartas → 3 × 6 = 18.
- **Fila 3**: una única fila de **10** cartas, boca arriba, compartida por los tres picos.
- Total 28. Sólo la fila 3 empieza boca arriba; el resto, boca abajo.
- Solapamiento: cada carta de las filas 0–2 está cubierta por **2** cartas de la fila siguiente.
  Las conexiones de la fila 3 son las estándar:

```
        A           B           C            filas 0
      A1  A2      B1  B2      C1  C2         fila 1  (A cubierta por A1,A2)
    a b   c d   e f   g h   i j   k l        fila 2
   0 1 2 3 4 5 6 7 8 9                       fila 3 (10 cartas)
```
  Cada carta de la fila 2 (12 cartas: a…l) está cubierta por 2 cartas consecutivas de la fila 3;
  las cartas de fila 3 se comparten entre picos vecinos. La implementación debe definir el
  **grafo de cobertura explícito** como una tabla constante, no calcularlo con aritmética —
  y debe tener una prueba unitaria que verifique que las 28 posiciones tienen la cobertura correcta.

### Movimientos legales
- Una carta del tablero es **jugable** si está descubierta (sus dos tapadoras ya no están).
- Se juega al descarte si su valor es **uno más o uno menos** que la carta visible del descarte.
- **Envoltura A↔K**: activada por defecto (K sobre A y A sobre K son válidos). Configurable.
- **Robar**: mueve la cima del mazo al descarte. Rompe la escalera (empieza una nueva).
- **Sin redeal.**
- Al retirar una carta, las que quede descubiertas se voltean automáticamente.

### Victoria
Las 28 cartas del tablero retiradas.

### Puntuación
Cada carta encadenada sin robar vale más que la anterior (1, 2, 3, … de la racha). Bonus por
limpiar cada pico. Terminar con cartas en el mazo da bonus. La puntuación **no** afecta a las
recompensas diarias: sólo es un objetivo posible del reto.

### Atasco
Ninguna carta jugable y mazo vacío.

## 6. Tabla de verificación

Cada regla de arriba tiene una prueba. Como mínimo:

| Juego | Pruebas obligatorias |
|---|---|
| Todos | El reparto usa exactamente 52 (o 104) cartas, sin repetidos ni faltantes |
| Todos | `applyMove` con un movimiento ilegal devuelve error y **no** modifica el estado |
| Todos | deshacer(aplicar(s, m)) === s, para todo movimiento legal (propiedad, con fuzzing de semillas) |
| Klondike | El redeal conserva el orden del descarte |
| Klondike | Sólo un K entra en columna vacía |
| Spider | Un grupo de palos mezclados **no** se puede mover, aunque sea descendente |
| Spider | Repartir con una columna vacía está prohibido |
| Spider | La secuencia K→A del mismo palo se retira automáticamente |
| FreeCell | La fórmula del supermovimiento, incluidos los casos límite de destino vacío |
| Pirámide | Una carta con una sola tapadora retirada **no** es jugable |
| TriPeaks | Grafo de cobertura de las 28 posiciones |
| TriPeaks | Envoltura A↔K activada y desactivada |
