> ⚠️ **Documento histórico, superado por [05-ui-ux.md](05-ui-ux.md).**
> La convención de nombres que se asume aquí (`heart_A.svg`) **no coincide con los ficheros
> reales** del repositorio de cartas, que son `heartAce.svg`, `club10.svg`, `clubKing.svg`…
> Usa 05-ui-ux.md.

Para la capa de renderizado visual (UI), he decidido utilizar un repositorio de cartas de código abierto en formato SVG (gráfico vectorial). Quiero que el motor visual que diseñes cargue estas imágenes en lugar de dibujar las cartas con CSS puro.

Para que puedas escribir la lógica de renderizado, asume la siguiente estructura de carpetas y convención de nombres en el proyecto:

1.  **Ubicación:** Todos los archivos SVG estarán guardados en una carpeta estática llamada `/assets/cards/Vertical2/svgs`.
2.  **Reverso de la carta:** El diseño de la parte trasera de las cartas se llamará `blueBack.svg`.
3.  **Cartas boca arriba:** La convención de nombres será `{palo}_{valor}.svg`.
    *   **Palos:** `heart` (corazones), `diamond` (diamantes), `club` (tréboles), `spade` (picas).
    *   **Valores:** `A`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `Jack`, `Queen`, `King`.
    *   **Ejemplos:** `/assets/cards/Vertical2/svgs/heart_A.svg`, `/assets/cards/Vertical2/svgs/spade_10.svg`, `/assets/cards/Vertical2/svgs/club_K.svg`.

Por favor, escribe la función o clase encargada del renderizado (UI) en TypeScript para que reciba el estado del tablero (de nuestro motor lógico) y genere dinámicamente elementos `<img>` de HTML, inyectando la ruta correcta del archivo SVG basándose en las propiedades de palo y valor de cada carta. 

Asegúrate de que estas imágenes mantengan las propiedades de diseño responsive y drag-and-drop que definimos en los requisitos anteriores.