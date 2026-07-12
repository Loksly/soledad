import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/**
 * Presupuesto de bundle (docs/09 §4). Falla la build si se pasa: un presupuesto que no rompe
 * nada no es un presupuesto, es un deseo.
 */

const LIMIT_KB = 200; // JS + CSS, comprimido
const DIST = 'dist/assets';

let total = 0;
const rows = [];

for (const file of readdirSync(DIST)) {
  if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
  const path = join(DIST, file);
  const gzipped = gzipSync(readFileSync(path)).length;
  total += gzipped;
  rows.push({ file, raw: statSync(path).size, gzip: gzipped });
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
for (const row of rows.sort((a, b) => b.gzip - a.gzip)) {
  console.log(`  ${row.file.padEnd(32)} ${kb(row.raw).padStart(10)} → ${kb(row.gzip).padStart(9)} gzip`);
}

const totalKb = total / 1024;
console.log(`\nTotal comprimido: ${totalKb.toFixed(1)} kB  (límite: ${LIMIT_KB} kB)`);

if (totalKb > LIMIT_KB) {
  console.error(`\nFALLO: el bundle se pasa del presupuesto en ${(totalKb - LIMIT_KB).toFixed(1)} kB.`);
  process.exit(1);
}
console.log('OK.');
