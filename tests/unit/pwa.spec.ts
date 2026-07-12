import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * La PWA es la vía de instalación sin tienda, sin cuenta de desarrollador y sin revisiones
 * (docs/08 §5.4). Estas pruebas comprueban que lo que se publica es INSTALABLE y que de verdad
 * funciona sin conexión, que es la única promesa que hace.
 *
 * Se saltan si no hay `dist/`: no todo el mundo compila antes de pasar los tests.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const built = existsSync(join(DIST, 'sw.js'));

describe.skipIf(!built)('PWA', () => {
  const manifest = JSON.parse(
    readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'),
  ) as Record<string, unknown> & { icons: { src: string; sizes: string; purpose?: string }[] };

  /**
   * La base del despliegue: '/' con dominio propio o en el APK, '/<repo>/' en GitHub Pages. Las
   * pruebas no la fijan a mano — la leen — para que valgan igual en los dos casos. Una prueba que
   * sólo pasa en la raíz no habría cazado que las rutas de las cartas se rompían bajo /soledad/,
   * que es justo lo que pasó.
   */
  const BASE = String(manifest['start_url']);
  const local = (url: string): string => join(DIST, url.slice(BASE.length));

  it('el manifiesto tiene lo que Chrome exige para ofrecer "Instalar"', () => {
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
    for (const icon of manifest.icons) {
      expect(existsSync(local(icon.src)), `falta el icono ${icon.src}`).toBe(true);
      expect(statSync(local(icon.src)).size).toBeGreaterThan(0);
    }
  });

  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const precache = JSON.parse(
    /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)?.[1] ?? '[]',
  ) as string[];

  it('el service worker precachea todo lo necesario para jugar sin conexión', () => {
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
    const missing = precache.filter((url) => url !== BASE).filter((url) => !existsSync(local(url)));
    // Un fichero que falta hace que `cache.addAll` falle ENTERO, y el SW no se instala: la app
    // dejaría de funcionar sin conexión sin decir nada.
    expect(missing).toEqual([]);
  });

  it('no precachea los mazos de la tienda: se cachean al usarlos', () => {
    const other = precache.filter(
      (url) =>
        url.startsWith(`${BASE}assets/cards/`) &&
        !url.startsWith(`${BASE}assets/cards/Vertical2/`),
    );
    expect(other, 'precachear los 6 mazos serían 6,5 MB que casi nadie usa').toEqual([]);
    expect(sw).toContain("url.pathname.includes('/assets/cards/')");
  });

  it('la descarga inicial es razonable para un móvil con datos', () => {
    const bytes = precache
      .filter((url) => url !== BASE)
      .reduce((sum, url) => sum + statSync(local(url)).size, 0);
    expect(bytes / 1024 / 1024).toBeLessThan(3);
  });

  it('sin red y sin caché, una navegación sigue sirviendo la app', () => {
    // Nunca la pantalla de dinosaurio: el juego no necesita nada del servidor.
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain(`caches.match('${BASE}index.html')`);
  });

  it('al publicar una versión nueva se borra la caché vieja', () => {
    expect(sw).toContain('caches.delete');
    expect(/const CACHE = 'soledad-[0-9a-f]{12}'/.test(sw)).toBe(true);
  });

  it('el service worker no llama a ningún origen externo', () => {
    // La promesa del proyecto es cero red. Un SW que hable con un tercero la rompería, y sería
    // el sitio perfecto para esconderlo.
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(/https?:\/\/(?!localhost)/.test(sw.replace(/\/\/.*$/gm, ''))).toBe(false);
  });

  it('todo cuelga de la MISMA ruta base: manifiesto, service worker y HTML', () => {
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
    const cards = join(DIST, 'assets', 'cards', 'Vertical2');
    const svgs = readdirSync(cards).filter((file) => file.endsWith('.svg'));
    expect(svgs).toEqual([]);
  });
});
