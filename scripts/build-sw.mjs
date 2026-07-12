import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

/**
 * Genera el Service Worker DESPUÉS del build, para precachear exactamente los ficheros que
 * existen (los del bundle llevan hash en el nombre y no se pueden escribir a mano).
 *
 * Estrategia, y el porqué de cada decisión:
 *
 * - Se PRECACHEA lo imprescindible para jugar sin conexión desde el primer segundo: la app, el
 *   mazo por defecto, el manifiesto de retos y los iconos. Son ~1,3 MB.
 * - NO se precachean los otros cinco mazos (6,5 MB): serían 6,5 MB de descarga que casi nadie va
 *   a usar. Se guardan en caché la primera vez que se piden, así que quien compre un mazo en la
 *   tienda lo tendrá offline a partir de entonces.
 * - "Cache first" para TODO. Esta app no tiene nada que pedirle a la red: si algo no está en
 *   caché, se intenta la red y, si tampoco, se cae con elegancia. Nunca se queda en blanco.
 *
 * El nombre de la caché lleva el hash del contenido: al publicar una versión nueva, el SW viejo
 * borra su caché entera. Sin trucos de versionado a mano que se olvidan.
 */

const DIST = 'dist';
const DEFAULT_DECK = 'assets/cards/Vertical2/';

/**
 * Bajo qué ruta se publica. '/' para el APK y para un dominio propio; '/<repo>/' en GitHub
 * Pages. Se aplica AQUÍ, en un solo sitio, en vez de con `sed` esparcidos por el YAML de CI.
 */
const BASE = process.env.BASE_URL ?? '/';

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
};

const files = walk(DIST).map((path) => relative(DIST, path).split('\\').join('/'));

const precache = files.filter(
  (file) =>
    file === 'index.html' ||
    file === 'manifest.webmanifest' ||
    file.startsWith('assets/index-') ||
    file.startsWith('assets/style-') ||
    file.startsWith('assets/web-') ||
    file.startsWith('assets/daily/') ||
    file.startsWith('icons/') ||
    file.startsWith(DEFAULT_DECK),
);

const bytes = precache.reduce((sum, file) => sum + statSync(join(DIST, file)).size, 0);
const version = createHash('sha256')
  .update(precache.map((file) => `${file}:${statSync(join(DIST, file)).size}`).join('|'))
  .digest('hex')
  .slice(0, 12);

const urls = [BASE, ...precache.map((file) => `${BASE}${file}`)];

const sw = `// GENERADO por scripts/build-sw.mjs. No se edita a mano.
const CACHE = 'soledad-${version}';
const PRECACHE = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  // El juego entero cabe en la caché: se baja todo de golpe y ya no se necesita la red nunca más.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Al publicar una versión nueva, la caché vieja se borra entera: nada de restos a medias.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;

      return fetch(request)
        .then((response) => {
          // Los mazos que no van precacheados (los de la tienda) se guardan la primera vez que
          // se usan: a partir de ahí funcionan sin conexión como todo lo demás.
          if (response.ok && url.pathname.includes('/assets/cards/')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Sin red y sin caché. Si es una navegación, se sirve la app: el juego funciona igual,
          // porque no necesita nada del servidor. Jamás una pantalla de dinosaurio.
          if (request.mode === 'navigate') return caches.match('${BASE}index.html');
          return new Response('', { status: 504, statusText: 'Sin conexión' });
        });
    }),
  );
});
`;

writeFileSync(join(DIST, 'sw.js'), sw, 'utf8');

// El manifiesto web también vive bajo esa base: si no, el icono y el `start_url` apuntan a la
// raíz del dominio y Chrome se niega a instalar la app.
const manifestPath = join(DIST, 'manifest.webmanifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.id = BASE;
manifest.start_url = BASE;
manifest.scope = BASE;
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: `${BASE}${icon.src.replace(/^\//, '')}`,
}));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const mb = (value) => `${(value / 1024 / 1024).toFixed(2)} MB`;
console.log(
  `service worker: ${precache.length} ficheros precacheados (${mb(bytes)}) · caché soledad-${version}`,
);
console.log(`  el resto de mazos (${mb(walkSize(join(DIST, 'assets/cards')) - bytes)}) se cachean al usarlos`);

function walkSize(dir) {
  return walk(dir).reduce((sum, path) => sum + statSync(path).size, 0);
}
