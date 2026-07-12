Actúa como un Ingeniero de Software Senior y Desarrollador de Videojuegos Mobile experto. Quiero crear una colección de solitarios clásicos para Android, completamente libre de publicidad (Ad-free), enfocado en la privacidad y optimizado para funcionar 100% offline (Local-First).

El proyecto se desarrollará utilizando HTML5, CSS3 y estrictamente TypeScript para toda la lógica de negocio, el motor del juego y el manejo del estado. El objetivo es estructurarlo de forma modular para empaquetarlo fácilmente en Android usando Capacitor o convertirlo en una PWA.

### 1. Núcleo del Juego (Mecánicas en TypeScript)
El juego debe incluir las siguientes variantes clásicas. Necesito que definas interfaces estáticas y tipos fuertes en TypeScript para la estructura de la baraja (Palo, Valor, Color, Carta) y el estado del tablero:
- **Klondike:** (Robo de 1 o 3 cartas).
- **Spider:** (Configurable para 1, 2 o 4 palos).
- **FreeCell:** (Cuatro casillas libres, cuatro bases).
- **Pyramid:** (Eliminar parejas que sumen 13).
- **TriPeaks:** (Eliminar cartas consecutivas hacia arriba o hacia abajo).

### 2. Diseño 100% Responsive y Adaptativo (UI/UX)
Este es un requisito crítico. La interfaz no puede ser estática:
- **Adaptabilidad de Pantalla:** Usa CSS Grid, Flexbox y unidades relativas (vh/vw/vmin) para que el tablero se escale perfectamente en cualquier resolución de pantalla de Android (desde teléfonos pequeños hasta tablets grandes).
- **Orientación Dinámica:** El juego debe ser jugable tanto en modo vertical (Portrait) como horizontal (Landscape), reorganizando las pilas de cartas según el espacio disponible sin que se superpongan o salgan de la pantalla.
- **Interacción Mobile-First:** Soporte nativo para eventos táctiles (Touch Events). Debe incluir "Drag and Drop" fluido adaptado a dedos, y un sistema de "tap" inteligente (un toque manda la carta automáticamente a la mejor posición legal disponible).

### 3. Sistema de Retención y Gamificación (Recurrencia Offline)
- **Desafíos Diarios:** El juego debe generar un conjunto de desafíos matemáticamente resolubles cada día para las distintas modalidades.
- **Generación Determinista:** Usa la fecha actual (YYYY-MM-DD) como semilla (seed) para un generador de números pseudoaleatorios (PRNG). Así, tendrás el mismo desafío diario en cualquier dispositivo sin necesidad de servidor central.
- **Sistema de Recompensas:** Un sistema sencillo en TypeScript que gestione la ganancia de experiencia (XP) y el desbloqueo de recompensas estéticas al jugar cada día.

### 4. Arquitectura Local-First
- **Almacenamiento Local Primario:** Todo el progreso, XP y estado actual de la partida se guardará en `localStorage` o `IndexedDB`.
- **Sincronización en la Nube (Opcional):** Diseña una interfaz `StorageService` en TypeScript que permita guardar opcionalmente el progreso en un backend gratuito (como Supabase) en el futuro, pero que funcione de forma autónoma offline por defecto.

### 5. Buenas Prácticas y Entrega del Código
- **Modularidad Extrema:** Separa completamente el "Core" (motor puro en TypeScript sin dependencias del DOM) de la capa de Renderizado (UI/DOM).
- **Estado Inmutable:** Utiliza un estado predecible para permitir una función de "Deshacer movimiento" (Undo) de forma infinita.

Por favor, comencemos diseñando la **arquitectura del proyecto y el motor lógico principal (Tipos, Interfaces y la clase principal del motor para Klondike)** en código TypeScript. Facilítame la estructura de archivos recomendada y el código `.ts` inicial, omitiendo de momento la implementación visual para centrarnos primero en la solidez de la lógica.
