# 11 — Prompt maestro

Este es el mensaje que se envía a Claude para arrancar la implementación. Copia el bloque de
abajo tal cual, **con el repositorio abierto en la sesión** (Claude Code, o subiendo `docs/` y
`assets/` como contexto), porque el prompt referencia a los demás documentos en vez de repetirlos.

---

## Prompt (copiar a partir de aquí)

```text
Eres un ingeniero de software senior especializado en juegos móviles y en TypeScript.

Vamos a construir "Soledad": una colección de solitarios clásicos para Android, libre de
publicidad. Sin anuncios, sin telemetría, sin compras, sin cuenta, 100 % offline.
El objetivo personal es simple: quiero jugar mis solitarios diarios sin esperar 30 segundos de
vídeo antes de cada partida.

## Antes de escribir una sola línea de código

1. Lee TODOS los ficheros de docs/ (README, 01 a 10). Son normativos: si te desvías de ellos,
   es un defecto. Presta especial atención a:
   - docs/03-reglas-de-juego.md — las reglas exactas de los 5 juegos. No improvises reglas de
     memoria: hay detalles (movimiento de grupos en Spider, supermovimiento de FreeCell,
     cobertura de TriPeaks) que casi todas las implementaciones hacen mal.
   - docs/09-calidad-y-buenas-practicas.md §8 — la lista de errores conocidos que NO vamos a
     cometer.
2. Lista de verdad el contenido de assets/cards/Vertical2/svgs/ antes de escribir el código de
   renderizado. La convención de nombres real es "spadeAce.svg", "club10.svg", "heartKing.svg"
   (camelCase, valor en palabra). El fichero docs/ui.md contiene un error histórico al respecto:
   ignóralo y usa docs/05-ui-ux.md.
3. Si algo de la documentación te parece contradictorio, ambiguo o simplemente equivocado,
   DÍMELO antes de implementarlo. No lo resuelvas en silencio adivinando: prefiero una pregunta
   ahora que un motor mal hecho después.

## Cómo vamos a trabajar

- Seguimos docs/10-roadmap.md fase por fase. No empieces la fase N+1 sin que los criterios de
  aceptación de la fase N estén cumplidos y verificados.
- Empezamos por la FASE 0 (esqueleto que produce un APK instalable). Nada de motor todavía.
  El riesgo más grande de este proyecto es descubrir en la semana 6 que la app no arranca en el
  móvil; lo matamos hoy.
- Trabaja en pasos pequeños y ejecutables. Al final de cada paso, dime exactamente qué comando
  debo correr para comprobarlo con mis propios ojos.
- Escribe las pruebas a la vez que el motor, no después. El motor es la única parte donde un
  fallo arruina una partida de 20 minutos de alguien.
- No añadas dependencias que no estén en docs/02-arquitectura.md sin justificarlas y
  preguntarme.

## Las reglas que no se rompen

- core/ y meta/ son puros: ni DOM, ni Capacitor, ni Preact, ni red, ni Math.random(), ni
  new Date(). El azar entra por una semilla; la fecha entra por services/clock.ts. Añade la
  regla de ESLint que lo impone, no lo dejes en un acuerdo de caballeros.
- El estado del juego es inmutable. Los movimientos son datos. Una partida es (semilla,
  movimientos[]) — así se guarda, así se deshace, así se depura.
- TypeScript strict. Cero `any`. Todo dato externo se valida con Zod.
- Cero publicidad, cero telemetría, cero SDKs de terceros. La variante base compila SIN el
  permiso INTERNET de Android, y eso es lo que hace la promesa verificable en vez de creíble.
- Deshacer es ilimitado y gratis. Nada en esta app cuesta esperar.

## Empieza ahora

Fase 0. Concretamente:

1. Monta el proyecto: Vite + TypeScript strict + Preact + Vitest + ESLint + Prettier +
   Capacitor, con la estructura de carpetas de docs/02-arquitectura.md §3.
2. Configura la regla de lint que impide que core/ importe del DOM o de Capacitor, y la que
   prohíbe Math.random() y new Date() fuera de rng.ts y clock.ts. Demuéstrame que fallan si se
   violan.
3. Una pantalla mínima que cargue y muestre UNA carta desde assets/cards/Vertical2/svgs/,
   escalada correctamente (relación 210:315).
4. Deja listo `npm run apk:debug` y dime los pasos exactos para instalarlo en mi móvil.
5. Comprueba y enséñame que el AndroidManifest resultante NO pide el permiso INTERNET.

Cuando la fase 0 esté verificada en mi dispositivo, seguimos con la fase 1 (núcleo + Klondike).

Antes de empezar: hazme las preguntas que necesites. Si no tienes ninguna, dime en dos frases
cuál es, en tu opinión, el mayor riesgo técnico de este proyecto y cómo piensas mitigarlo.
```

## Fin del prompt

---

## Notas sobre por qué el prompt está escrito así

- **Referencia, no repite.** Meter las reglas de los cinco solitarios dentro del prompt lo haría
  ilegible y, peor, crearía dos fuentes de la verdad que se desincronizarían. Los documentos
  mandan.
- **Le prohíbe explícitamente confiar en su memoria** para las reglas. Un modelo "sabe" jugar al
  Spider, y ese conocimiento aproximado es justo lo que produce el bug del movimiento de grupos.
- **Le obliga a listar el directorio de assets.** Es la corrección del error de `ui.md`, y de paso
  le enseña a verificar antes de asumir.
- **Empieza por el APK, no por el juego.** Es contraintuitivo y es lo correcto: el riesgo mayor no
  es escribir un Klondike, es que la cadena web→Android tenga una sorpresa.
- **Le pide que pregunte y que nombre el riesgo mayor.** Una respuesta que no plantee ninguna
  duda ante 10 documentos de requisitos es una señal de alarma, no de competencia.

## Prompts de continuación (para las fases siguientes)

Al empezar cada fase, basta con:

```text
Fase 0 verificada: el APK se instala, la carta se ve y el manifiesto no pide INTERNET.

Pasamos a la FASE 1 de docs/10-roadmap.md: el núcleo (core/card, deck, rng, types, engine,
history) y el motor de Klondike según docs/03-reglas-de-juego.md §1.

Sin interfaz: quiero jugar una partida entera desde un test. Escribe las pruebas de propiedades
(conservación de cartas, reversibilidad del undo, legalidad, determinismo) y la prueba dorada del
reparto. Recuerda que, una vez que exista esa prueba dorada, el PRNG y el barajado quedan
congelados para siempre.
```

Y así sucesivamente. Cada fase, un mensaje; cada mensaje, sus criterios de aceptación.
