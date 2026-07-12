import { mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { optimize, type Config } from 'svgo';
import sharp from 'sharp';
import { SUITS, RANKS, assetName } from '../src/core/card';

/**
 * Prepara las cartas para el bundle (docs/08 §4, docs/05 §1).
 *
 * POR QUÉ SE RASTERIZAN, cuando docs/05 hablaba de `<img>` con SVG:
 *
 * Los SVG del repositorio son de índice jumbo y vienen de Inkscape. Una sola figura pesa hasta
 * **744 kB** (`clubKing.svg`), y el mazo entero 5,3 MB incluso después de pasarle SVGO. Como
 * docs/05 §1 exige precargar las 54 imágenes ANTES de enseñar el tablero, eso son 5,3 MB de
 * rutas vectoriales que hay que descomprimir y rasterizar en el hilo principal de un WebView
 * de gama media... para pintarlas a 130 px de ancho como mucho. Se cargaba de un plumazo el
 * presupuesto de "arranque en frío < 2 s" (docs/01 §6).
 *
 * docs/05 §1 anticipaba justo esto y mandaba **medir y quedarse con lo que arranque más rápido,
 * documentando la decisión**. Esta es la decisión: se rasteriza a WebP a 3× el tamaño máximo de
 * carta. Ese mismo clubKing pasa de 744 kB a **29 kB**, y el mazo de 5,3 MB a menos de 1 MB.
 *
 * El SVG sigue siendo la fuente de verdad en assets/: si mañana hace falta un mazo más grande,
 * se sube el factor y se regenera. No se pierde nada.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCE = join(ROOT, 'assets', 'cards');
const TARGET = join(ROOT, 'public', 'assets', 'cards');

/**
 * Los seis mazos van DENTRO del APK, y esto cambia respecto a la idea inicial de empaquetar
 * sólo el de por defecto (docs/08 §4).
 *
 * El motivo es que la tienda vende los otros mazos y el `Accessible` es obligatorio por
 * accesibilidad (docs/09 §5). Un mazo que se puede equipar pero no está en el APK son 52 cartas
 * EN BLANCO: no es una descarga que falta, es un defecto. Y descargarlos bajo demanda exigiría
 * el permiso INTERNET, que es justo lo que este proyecto existe para no pedir.
 *
 * Ya rasterizados a WebP son ~1 MB cada uno: los seis caben de sobra en el presupuesto de 15 MB.
 * Empaquetarlos como SVG (17 MB por mazo) habría sido imposible; ésta es la otra razón por la
 * que se rasteriza.
 */
const BUNDLED_DECKS = [
  'Vertical2',
  'Vertical4',
  'Horizontal2',
  'Horizontal4',
  'Accessible/Vertical',
  'Accessible/Horizontal',
];
const BACKS = ['blueBack', 'redBack'];

/** El layout nunca pinta una carta de más de 130 px de ancho (ui/layout/geometry.ts), así que
 *  3× cubre hasta una pantalla de densidad 3 sin que se vea un solo píxel. */
const CARD_W = 130 * 3;
const CARD_H = Math.round(CARD_W * (315 / 210));

const SVGO: Config = {
  multipass: true,
  plugins: [{ name: 'preset-default', params: { overrides: { cleanupIds: false } } }],
};

let bytesIn = 0;
let bytesOut = 0;
let files = 0;
let skipped = 0;

for (const deck of BUNDLED_DECKS) {
  const from = join(SOURCE, deck, 'svgs');
  const to = join(TARGET, deck);
  if (!existsSync(from)) {
    console.error(`No existe ${from}. ¿Se movió assets/cards/?`);
    process.exit(1);
  }
  mkdirSync(to, { recursive: true });

  const names = [...SUITS.flatMap((suit) => RANKS.map((rank) => assetName(suit, rank))), ...BACKS];

  for (const name of names) {
    const source = join(from, `${name}.svg`);
    if (!existsSync(source)) {
      // Una ruta rota se ve como una carta EN BLANCO en el móvil, y con 52 cartas es carísimo
      // de depurar tarde. Que reviente aquí, en el build, y no allí (docs/09 §8 nº 11).
      console.error(`FALTA la carta ${source}`);
      process.exit(1);
    }

    const target = join(to, `${name}.webp`);
    // Rasterizar 324 cartas cuesta minutos. Si el WebP ya existe y es más nuevo que su SVG, no
    // hay nada que hacer: `npm run build` no puede castigar con eso a cada compilación.
    if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) {
      bytesIn += statSync(source).size;
      bytesOut += statSync(target).size;
      files++;
      skipped++;
      continue;
    }

    const raw = readFileSync(source, 'utf8');
    const cleaned = optimize(raw, { path: source, ...SVGO }).data;

    const webp = await sharp(Buffer.from(cleaned), { density: 300 })
      .resize(CARD_W, CARD_H, { fit: 'fill' })
      .webp({ quality: 90, effort: 6 })
      .toBuffer();
    writeFileSync(target, webp);

    bytesIn += statSync(source).size;
    bytesOut += webp.length;
    files++;
  }
}

// El manifiesto de retos va como asset estático, no dentro del bundle de JS: a diez años son
// ~1,5 MB de JSON y no caben en el presupuesto (ver src/app/dailies.ts).
const manifestFrom = join(ROOT, 'data', 'daily', 'manifest.json');
if (existsSync(manifestFrom)) {
  const to = join(ROOT, 'public', 'assets', 'daily');
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, 'manifest.json'), readFileSync(manifestFrom));
  const days = Object.keys(
    (JSON.parse(readFileSync(manifestFrom, 'utf8')) as { deals: Record<string, unknown> }).deals,
  ).length;
  console.log(`manifiesto de retos: ${days} días`);
} else {
  console.warn('AVISO: no hay data/daily/manifest.json. Genéralo con `npm run dailies`.');
}

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
console.log(
  `${files} cartas a ${CARD_W}×${CARD_H} · ${mb(bytesIn)} de SVG → ${mb(bytesOut)} de WebP ` +
    `(${(100 - (bytesOut / bytesIn) * 100).toFixed(0)} % menos)` +
    (skipped > 0 ? ` · ${skipped} ya estaban al día` : ''),
);
