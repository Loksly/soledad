import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

/**
 * Icono de la app, generado del propio mazo: un As de picas sobre el tapete verde.
 *
 * Ni el icono ni los colores evocan a ningún producto comercial existente, que es un requisito
 * legal explícito del proyecto (docs/08 §5.3).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CARD = join(ROOT, 'assets', 'cards', 'Vertical2', 'svgs', 'spadeAce.svg');
const OUT = join(ROOT, 'public', 'icons');

mkdirSync(OUT, { recursive: true });

const FELT = { r: 27, g: 94, b: 58 };

const build = async (size: number, padding: number, name: string): Promise<void> => {
  const inner = Math.round(size * (1 - padding * 2));
  const cardW = Math.round(inner / 1.5);
  const cardH = Math.round(cardW * (315 / 210));

  const card = await sharp(CARD, { density: 400 })
    .resize(cardW, Math.min(cardH, inner), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const icon = await sharp({
    create: { width: size, height: size, channels: 4, background: { ...FELT, alpha: 1 } },
  })
    .composite([{ input: card, gravity: 'center' }])
    .png()
    .toBuffer();

  writeFileSync(join(OUT, name), icon);
};

// El icono "maskable" lleva más margen: Android le recorta las esquinas a su antojo y una carta
// pegada al borde saldría mutilada.
await build(192, 0.12, 'icon-192.png');
await build(512, 0.12, 'icon-512.png');
await build(512, 0.22, 'icon-maskable-512.png');

console.log('iconos: 192, 512 y maskable-512');
