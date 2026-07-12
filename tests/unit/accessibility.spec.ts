import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ACCESIBILIDAD DE SERIE.
 *
 * Esta app existe para que una persona mayor pueda jugar sin que nadie la engañe. Si el texto no
 * se lee o los botones no se aciertan, no hemos resuelto nada: la habremos dejado igual de
 * indefensa, sólo que sin anuncios.
 *
 * Estas pruebas no son cosmética. Son el suelo por debajo del cual la app deja de servir para lo
 * que se hizo.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(ROOT, 'src', 'ui', 'theme', 'styles.css'), 'utf8');

/** El tamaño de letra del sistema Android sólo escala el texto en unidades relativas. */
describe('el texto respeta el tamaño de letra del sistema', () => {
  it('ni una sola declaración de font-size en píxeles', () => {
    // Un `font-size: 13px` IGNORA que la persona tenga el Android con la letra al máximo. Y la
    // tiene al máximo precisamente porque la necesita. Es el fallo de accesibilidad más común y
    // el más fácil de cometer sin darse cuenta.
    const pixelFonts = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => m[0]);
    expect(pixelFonts, 'usa rem, no px: el px no escala con el ajuste del sistema').toEqual([]);
  });

  it('la raíz deja mandar al navegador, no fija el tamaño', () => {
    // `html { font-size: 14px }` es la otra forma de romperlo: anula el ajuste del sistema para
    // TODA la app de un plumazo, por muchos rem que se usen después.
    expect(css).toMatch(/html\s*\{[^}]*font-size:\s*100%/);
    expect(css).not.toMatch(/html\s*\{[^}]*font-size:\s*\d+px/);
  });

  it('ningún texto baja de un tamaño legible', () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);

    const tiny = sizes.filter((size) => size < 0.85);
    // 0,85 rem ≈ 13,6 px con la configuración por defecto, y crece con el ajuste del sistema.
    // Por debajo de eso ya no se lee sin gafas, y las gafas no siempre están a mano.
    expect(tiny, `hay texto por debajo de 0,85rem: ${tiny.join(', ')}`).toEqual([]);
  });
});

describe('los botones se pueden acertar con el dedo', () => {
  it('ningún objetivo táctil baja de 44 px', () => {
    const heights = [...css.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights.length).toBeGreaterThan(5);

    const small = heights.filter((height) => height < 44);
    // 44 px es el MÍNIMO de la norma (docs/09 §5), no un objetivo. Para una mano con temblor o
    // artrosis, 44 es justo; por debajo es una lotería.
    expect(small, `hay botones de menos de 44 px: ${small.join(', ')}`).toEqual([]);
  });

  it('los botones principales son holgados, no mínimos', () => {
    // La media debe estar cómodamente por encima del mínimo legal. Cumplir la norma al ras es
    // cumplirla en el papel y fallarle a la persona.
    const heights = [...css.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    const average = heights.reduce((sum, height) => sum + height, 0) / heights.length;
    expect(average).toBeGreaterThanOrEqual(50);
  });
});

describe('se ve', () => {
  it('las animaciones se pueden apagar de verdad: duración CERO', () => {
    // "Un poco menos" no vale (docs/05 §2). Para quien se marea o no sigue el movimiento, una
    // animación acortada sigue siendo una animación.
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/transition-duration:\s*0ms\s*!important/);
    expect(css).toMatch(/animation-duration:\s*0ms\s*!important/);
  });

  it('el tema oscuro y el claro definen los dos el color de texto apagado', () => {
    // El gris "discreto" es donde se cuela el texto ilegible. Que exista en ambos temas obliga a
    // pensarlo dos veces, en vez de heredar un valor que sólo funciona en uno.
    expect(css).toMatch(/:root\[data-theme='light'\][^}]*--muted:/);
    expect(css).toMatch(/:root\[data-theme='dark'\][^}]*--muted:/);
  });
});
