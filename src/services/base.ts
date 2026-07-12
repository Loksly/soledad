/**
 * Bajo qué ruta vive la app.
 *
 * Vite reescribe las rutas de los ficheros que él empaqueta, pero NO las cadenas que
 * construimos a mano (las de las cartas y la del manifiesto de retos). Publicando en GitHub
 * Pages, que sirve bajo /<repo>/, esas rutas apuntarían a la raíz del dominio y saldrían 52
 * cartas en blanco. Es exactamente la trampa que avisa docs/09 §8 nº 11, sólo que por el otro
 * lado.
 *
 * `import.meta.env.BASE_URL` vale '/' en el APK y en un dominio propio, y '/soledad/' en Pages.
 */
export const BASE: string = import.meta.env.BASE_URL || '/';

/** Ruta absoluta a un recurso empaquetado. La ÚNICA forma de construirla. */
export const asset = (path: string): string => `${BASE}${path.replace(/^\//, '')}`;
