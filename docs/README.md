# Soledad — Colección de solitarios libre de publicidad

Documentación de requisitos para construir una colección libre de solitarios clásicos (sin
anuncios, sin telemetría, sin compras), desplegable en Android.

## Resumen ejecutivo

**Qué es.** Una aplicación Android con los cinco solitarios clásicos (Klondike, Spider,
FreeCell, Pirámide y TriPeaks), con **retos diarios** y un sistema de **recompensas por
jugar cada día** que fomenta la recurrencia. Funciona **100 % sin conexión**; la nube es
opcional, opt-in y sólo para copia de seguridad de preferencias y progreso.

**Qué NO es.** No hay publicidad, ni banners, ni vídeos recompensados, ni "energía", ni
suscripción, ni analítica, ni identificadores de usuario. Nada bloquea al jugador ni le
hace esperar.

**Cómo se construye.** TypeScript + Vite + Preact, empaquetado con Capacitor en un APK/AAB.
Motor de juego puro y determinista, separado por completo de la interfaz. Cartas SVG de
dominio público ya incluidas en [assets/cards/](../assets/cards/).

## Índice de la documentación

| Documento | Contenido |
|---|---|
| [00-prompt-original.md](00-prompt-original.md) | Borrador inicial del encargo (histórico, no normativo) |
| [01-vision-y-alcance.md](01-vision-y-alcance.md) | Objetivos, principios de producto, alcance y no-objetivos |
| [02-arquitectura.md](02-arquitectura.md) | Stack tecnológico, capas, estructura de carpetas, decisiones |
| [03-reglas-de-juego.md](03-reglas-de-juego.md) | Reglas exactas de los cinco juegos (especificación normativa) |
| [04-motor-logico.md](04-motor-logico.md) | Modelo de dominio, RNG determinista, undo, pistas, solucionador |
| [05-ui-ux.md](05-ui-ux.md) | Renderizado, animaciones, gestos, layouts responsive |
| [06-diario-y-recompensas.md](06-diario-y-recompensas.md) | Retos diarios, rachas, monedas, insignias, Club de Estrellas |
| [07-persistencia-y-sync.md](07-persistencia-y-sync.md) | Almacenamiento local, migraciones, nube opcional |
| [08-android-build-y-despliegue.md](08-android-build-y-despliegue.md) | Capacitor, permisos, firma, tamaño, F-Droid |
| [09-calidad-y-buenas-practicas.md](09-calidad-y-buenas-practicas.md) | Convenciones, pruebas, CI, accesibilidad, rendimiento |
| [10-roadmap.md](10-roadmap.md) | Fases de implementación con criterios de aceptación |
| [11-prompt-maestro.md](11-prompt-maestro.md) | **El prompt listo para enviar a Claude** |
| [ui.md](ui.md) | Nota original sobre la capa visual (contiene un error de nombres: ver 05) |

## Cómo usar esto

1. Envía a Claude el contenido de [11-prompt-maestro.md](11-prompt-maestro.md), con el
   repositorio completo disponible en la sesión: el prompt referencia al resto de documentos.
2. Los documentos 01–09 son **normativos**: si la implementación se desvía de ellos, es un defecto.
3. El documento 10 marca el orden de construcción. No se pasa de fase sin cumplir sus
   criterios de aceptación.

## Aviso legal

Este proyecto implementa *reglas de juego* de solitarios clásicos —Klondike, Spider, FreeCell,
Pirámide y TriPeaks—, que son de **dominio público** y no son protegibles por copyright. Los
nombres de esos juegos son genéricos y llevan más de un siglo en uso.

**No se usa ninguna marca, logotipo, arte, sonido, texto ni código de ninguna empresa.** El
nombre, el icono y la estética del producto no deben evocar a ninguna marca registrada ajena.
Las cartas provienen de [SVG-cards, de Saul Spatz](../assets/README.md), en **dominio público**.

Ver [CREDITS.md](../CREDITS.md) para la atribución completa.
