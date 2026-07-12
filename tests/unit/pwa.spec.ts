import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * La PWA es la vía de instalación sin tienda, sin cuenta de desarrollador y sin revisiones
 * (docs/08 §5.4). Estas pruebas comprueban que lo que se publica es INSTALABLE y que de verdad
 * funciona sin conexión, que es la única promesa que hace.
 *
 * Estas pruebas MIRAN `dist/`, así que exigen haber compilado. En CI, `npm run build` va antes
 * que `npm test` justo por esto.
 *
 * Antes se saltaban solas si no había `dist/`. Era peor de lo que parecía: en CI nunca había
 * `dist/`, así que la suite entera se saltaba EN SILENCIO y no protegía de nada. Una prueba que
 * se desactiva sola en el único sitio donde importa es peor que no tenerla, porque además
 * tranquiliza. Ahora, si falta el build, falla y dice qué hacer.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');

const requireBuild = (): void => {
  if (!existsSync(join(DIST, 'sw.js'))) {
    throw new Error('No hay dist/. Compila antes de pasar estas pruebas:  npm run build');
  }
};

/**
 * Todas las lecturas son PEREZOSAS, dentro de cada prueba.
 *
 * `describe.skipIf` no evita que se ejecute el cuerpo del `describe`: Vitest lo recorre igual
 * para recolectar los tests, sólo que luego los marca como saltados. Leer un fichero ahí fuera
 * revienta la recolección del fichero entero antes de poder saltarse nada. Se aprendió a las
 * malas, con la build de CI en rojo.
 */
interface Manifest extends Record<string, unknown> {
  icons: { src: string; sizes: string; purpose?: string }[];
}

const readManifest = (): Manifest => {
  requireBuild();
  return JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')) as Manifest;
};

const readSw = (): string => {
  requireBuild();
  return readFileSync(join(DIST, 'sw.js'), 'utf8');
};

/** Bajo qué ruta se publica: '/' con dominio propio, '/<repo>/' en GitHub Pages. Se LEE, no se
 *  fija a mano, para que las pruebas valgan igual en los dos casos. */
const baseOf = (manifest: Manifest): string => String(manifest['start_url']);
const localPath = (base: string, url: string): string => join(DIST, url.slice(base.length));

const readPrecache = (sw: string): string[] =>
  JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)?.[1] ?? '[]') as string[];

describe('PWA', () => {

  it('el manifiesto tiene lo que Chrome exige para ofrecer "Instalar"', () => {
    const manifest = readManifest();
    const BASE = baseOf(manifest);
    expect(manifest['name']).toBe('Soledad');
    expect(BASE.startsWith('/') && BASE.endsWith('/')).toBe(true);
    expect(manifest['display']).toBe('standalone');
    expect(manifest['icons'].length).toBeGreaterThanOrEqual(2);

    // Sin un icono de 192 y otro de 512, Chrome NO ofrece instalar la app. Es el error más
    // típico de una PWA que "no sale el botón".
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    // Y uno `maskable`, o Android le recorta las esquinas al icono y sale mutilado.
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('los iconos que el manifiesto promete existen de verdad', () => {
    const manifest = readManifest();
    const BASE = baseOf(manifest);
    const local = (url: string): string => localPath(BASE, url);
    for (const icon of manifest.icons) {
      expect(existsSync(local(icon.src)), `falta el icono ${icon.src}`).toBe(true);
      expect(statSync(local(icon.src)).size).toBeGreaterThan(0);
    }
  });

  it('el service worker precachea todo lo necesario para jugar sin conexión', () => {
    const BASE = baseOf(readManifest());
    const precache = readPrecache(readSw());
    expect(precache).toContain(BASE);
    expect(precache).toContain(`${BASE}index.html`);
    expect(precache.some((url) => url.includes('/assets/index-') && url.endsWith('.js'))).toBe(true);
    expect(precache.some((url) => url.endsWith('.css'))).toBe(true);

    // El mazo por defecto ENTERO: 52 caras + 2 reversos. Si faltara una sola carta, saldría en
    // blanco justo cuando el usuario está sin conexión, que es el peor momento posible.
    const deck = precache.filter((url) => url.startsWith(`${BASE}assets/cards/Vertical2/`));
    expect(deck).toHaveLength(54);

    // Y el manifiesto de retos: sin él no habría retos diarios en modo avión.
    expect(precache.some((url) => url.startsWith(`${BASE}assets/daily/`))).toBe(true);
  });

  it('todo lo que el service worker promete precachear existe en dist/', () => {
    const BASE = baseOf(readManifest());
    const precache = readPrecache(readSw());
    const local = (url: string): string => localPath(BASE, url);
    const missing = precache.filter((url) => url !== BASE).filter((url) => !existsSync(local(url)));
    // Un fichero que falta hace que `cache.addAll` falle ENTERO, y el SW no se instala: la app
    // dejaría de funcionar sin conexión sin decir nada.
    expect(missing).toEqual([]);
  });

  it('no precachea los mazos de la tienda: se cachean al usarlos', () => {
    const BASE = baseOf(readManifest());
    const sw = readSw();
    const precache = readPrecache(sw);
    const other = precache.filter(
      (url) =>
        url.startsWith(`${BASE}assets/cards/`) &&
        !url.startsWith(`${BASE}assets/cards/Vertical2/`),
    );
    expect(other, 'precachear los 6 mazos serían 6,5 MB que casi nadie usa').toEqual([]);
    expect(sw).toContain("url.pathname.includes('/assets/cards/')");
  });

  it('la descarga inicial es razonable para un móvil con datos', () => {
    const BASE = baseOf(readManifest());
    const precache = readPrecache(readSw());
    const local = (url: string): string => localPath(BASE, url);
    const bytes = precache
      .filter((url) => url !== BASE)
      .reduce((sum, url) => sum + statSync(local(url)).size, 0);
    expect(bytes / 1024 / 1024).toBeLessThan(3);
  });

  it('sin red y sin caché, una navegación sigue sirviendo la app', () => {
    const BASE = baseOf(readManifest());
    const sw = readSw();
    // Nunca la pantalla de dinosaurio: el juego no necesita nada del servidor.
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain(`caches.match('${BASE}index.html')`);
  });

  it('al publicar una versión nueva se borra la caché vieja', () => {
    const sw = readSw();
    expect(sw).toContain('caches.delete');
    expect(/const CACHE = 'soledad-[0-9a-f]{12}'/.test(sw)).toBe(true);
  });

  it('el service worker no llama a ningún origen externo', () => {
    const sw = readSw();
    // La promesa del proyecto es cero red. Un SW que hable con un tercero la rompería, y sería
    // el sitio perfecto para esconderlo.
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(/https?:\/\/(?!localhost)/.test(sw.replace(/\/\/.*$/gm, ''))).toBe(false);
  });

  it('todo cuelga de la MISMA ruta base: manifiesto, service worker y HTML', () => {
    const manifest = readManifest();
    const BASE = baseOf(manifest);
    const precache = readPrecache(readSw());
    const local = (url: string): string => localPath(BASE, url);
    // En GitHub Pages la app vive bajo /<repo>/, no en la raíz. Si el manifiesto dice una cosa y
    // el service worker otra, o Chrome no ofrece instalar la app, o la instala y luego no
    // encuentra sus propios ficheros. Pasó de verdad: las rutas de las cartas las construimos a
    // mano y Vite no las reescribe (por eso existe services/base.ts).
    expect(manifest['scope']).toBe(BASE);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith(BASE), `el icono ${icon.src} no cuelga de ${BASE}`).toBe(true);
    }
    for (const url of precache) {
      expect(url.startsWith(BASE), `${url} no cuelga de ${BASE}`).toBe(true);
    }

    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((match) => match[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      expect(src.startsWith(BASE), `el bundle ${src} no cuelga de ${BASE}`).toBe(true);
    }

    // Y el bundle debe pedir las cartas bajo esa misma base, no bajo '/'.
    const bundle = readFileSync(local(scripts[0] ?? ''), 'utf8');
    expect(bundle).toContain('assets/cards/');
  });

  it('dist/ no contiene los SVG originales: se publican los WebP', () => {
    requireBuild();
    const cards = join(DIST, 'assets', 'cards', 'Vertical2');
    const svgs = readdirSync(cards).filter((file) => file.endsWith('.svg'));
    expect(svgs).toEqual([]);
  });
});
