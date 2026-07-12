import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { classify, solve } from '../src/core/solver/generic';
import { dailySeed, difficultiesFor, variantFor, type DailyEntry, type DailyManifest, type Difficulty } from '../src/meta/daily';
import { GAME_IDS, type GameId } from '../src/core/types';

/**
 * Genera y VERIFICA con el solver los repartos diarios (docs/04 §5).
 *
 * Esto corre en CI, jamás en el móvil: el teléfono sólo lee la semilla del manifiesto, así que
 * el coste en batería es cero y la partida es la misma en todos los dispositivos.
 *
 *   npm run dailies -- --from 2026-01-01 --to 2026-12-31
 *
 * El manifiesto es un cambio de DATOS, no de código: se revisa como tal (docs/09 §7).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'data', 'daily');

/** Presupuesto por semilla. La clave no es demostrar una semilla concreta, sino ENCONTRAR una
 *  buena: rechazar rápido y probar otra sale mucho más barato que insistir en una mala. */
const NODE_BUDGET: Readonly<Record<GameId, number>> = {
  freecell: 40_000,
  klondike: 30_000,
  pyramid: 40_000,
  spider: 20_000,
  tripeaks: 20_000,
};

const MAX_ATTEMPTS = 24;

interface Job {
  readonly date: string;
  readonly game: GameId;
  readonly difficulty: Difficulty;
}

interface Done extends Job {
  readonly entry: DailyEntry | null;
  readonly attempts: number;
}

/** Busca una semilla resoluble Y de la dificultad planificada. Si no la encuentra con la
 *  dificultad exacta, se queda con la mejor resoluble: un reto raro pero jugable es mucho
 *  mejor que un hueco en el calendario. */
function findSeed(job: Job): Done {
  const variant = variantFor(job.game, job.difficulty);
  const base = dailySeed(job.date, job.game, job.difficulty);
  let fallback: DailyEntry | null = null;

  const attempt = (index: number, budget: number): DailyEntry | null => {
    const seed = (base + index * 0x9e3779b9) >>> 0;
    const result = solve(job.game, variant, seed, { maxNodes: budget });
    if (!result.solved) return null;
    return { seed, difficulty: classify(result), verified: true, minMoves: result.moves.length };
  };

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const entry = attempt(i, NODE_BUDGET[job.game]);
    if (!entry) continue;
    if (entry.difficulty === job.difficulty) return { ...job, entry, attempts: i + 1 };
    fallback ??= entry;
  }
  if (fallback) return { ...job, entry: fallback, attempts: MAX_ATTEMPTS };

  // Ni una semilla resoluble con el presupuesto normal. Antes de dejar un hueco en el
  // calendario, se insiste con un presupuesto mucho mayor: un día sin reto es peor que un
  // minuto de CPU en un job nocturno.
  for (let i = 0; i < 8; i++) {
    const entry = attempt(i, NODE_BUDGET[job.game] * 8);
    if (entry) return { ...job, entry, attempts: MAX_ATTEMPTS + i + 1 };
  }
  return { ...job, entry: null, attempts: MAX_ATTEMPTS + 8 };
}

// ---------------------------------------------------------------------------- worker

if (!isMainThread && parentPort) {
  const jobs = workerData as Job[];
  parentPort.postMessage(jobs.map(findSeed));
}

// ---------------------------------------------------------------------------- main

const parseArgs = (): { from: string; to: string } => {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };
  return { from: value('--from', '2026-01-01'), to: value('--to', '2027-12-31') };
};

const eachDate = (from: string, to: string): string[] => {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let day = start; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
};

const runWorker = (jobs: Job[]): Promise<Done[]> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: jobs,
      execArgv: ['--import', 'tsx'],
    });
    worker.on('message', (results: Done[]) => resolve(results));
    worker.on('error', reject);
  });

async function main(): Promise<void> {
  const { from, to } = parseArgs();
  const dates = eachDate(from, to);

  const jobs: Job[] = dates.flatMap((date) => {
    const difficulties = difficultiesFor(date);
    return GAME_IDS.map((game) => ({ date, game, difficulty: difficulties[game] }));
  });

  const workers = Math.max(1, Math.min(cpus().length - 2, 14));
  const chunks: Job[][] = Array.from({ length: workers }, () => []);
  jobs.forEach((job, index) => (chunks[index % workers] as Job[]).push(job));

  console.log(
    `Generando ${jobs.length} repartos (${dates.length} días × ${GAME_IDS.length} juegos) ` +
      `con ${workers} procesos…`,
  );
  const started = Date.now();
  const results = (await Promise.all(chunks.map(runWorker))).flat();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const deals: Record<string, Partial<Record<GameId, DailyEntry>>> = {};
  let verified = 0;
  let missing = 0;

  for (const result of results) {
    if (!result.entry) {
      missing++;
      continue;
    }
    deals[result.date] ??= {};
    (deals[result.date] as Partial<Record<GameId, DailyEntry>>)[result.game] = result.entry;
    verified++;
  }

  const manifest: DailyManifest = { version: 1, from, to, deals };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest)}\n`, 'utf8');

  const byDifficulty = results.reduce<Record<string, number>>((counts, result) => {
    const key = result.entry?.difficulty ?? 'sin-semilla';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`Listo en ${elapsed}s · ${verified} verificados · ${missing} sin semilla resoluble`);
  console.log('Dificultad real medida:', byDifficulty);

  // Un día sin ningún reto sería un hueco en el calendario: eso sí es un fallo de build.
  const empty = dates.filter((date) => Object.keys(deals[date] ?? {}).length === 0);
  if (empty.length > 0) {
    console.error(`FALLO: ${empty.length} días sin ningún reto verificado.`);
    process.exit(1);
  }
}

if (isMainThread) {
  void main();
}
