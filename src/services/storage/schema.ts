import { z } from 'zod';

/**
 * TODO dato que entra desde fuera (fichero importado, blob de la nube) se valida con Zod antes
 * de tocarlo (docs/09 §1). Un JSON corrupto no puede tumbar la app ni corromper el progreso.
 */

export const SCHEMA_VERSION = 1;

const pileRef = z.object({ kind: z.enum(['tableau', 'foundation', 'stock', 'waste', 'free', 'peaks']), index: z.number().int().min(0) });

const move = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), from: pileRef, to: pileRef, count: z.number().int().min(1) }),
  z.object({ kind: z.literal('draw') }),
  z.object({ kind: z.literal('redeal') }),
  z.object({ kind: z.literal('deal') }),
  z.object({ kind: z.literal('remove'), piles: z.array(pileRef).min(1).max(2).readonly() }),
]);

const variant = z.discriminatedUnion('game', [
  z.object({
    game: z.literal('klondike'),
    draw: z.union([z.literal(1), z.literal(3)]),
    maxRedeals: z.number().int().min(0).nullable(),
    scoring: z.boolean(),
  }),
  z.object({ game: z.literal('spider'), suits: z.union([z.literal(1), z.literal(2), z.literal(4)]) }),
  z.object({
    game: z.literal('freecell'),
    freeCells: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({
    game: z.literal('pyramid'),
    maxRedeals: z.number().int().min(0),
    wasteSelfPairing: z.boolean(),
  }),
  z.object({ game: z.literal('tripeaks'), wrapAround: z.boolean() }),
]);

export const gameId = z.enum(['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks']);

/** Una partida guardada es (juego, variante, semilla, movimientos, cursor). Nunca el tablero. */
export const savedGame = z.object({
  id: z.string(),
  game: gameId,
  variant,
  seed: z.number().int(),
  moves: z.array(move).readonly(),
  cursor: z.number().int().min(0),
  undosUsed: z.number().int().min(0).default(0),
  hintsUsed: z.number().int().min(0).default(0),
  seconds: z.number().min(0).default(0),
  updatedAt: z.number().int().default(0),
  challengeDate: z.string().nullable().default(null),
});

export const settings = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  deck: z.string().default('Vertical2'),
  back: z.string().default('blueBack'),
  felt: z.string().default('green'),
  language: z.enum(['system', 'es', 'en']).default('system'),
  sound: z.boolean().default(false),
  haptics: z.boolean().default(true),
  animations: z.boolean().default(true),
  leftHanded: z.boolean().default(false),
  tapToFoundation: z.boolean().default(true),
  showTimer: z.boolean().default(true),
  dailyReminder: z.boolean().default(false),
  /** Aviso amable al pasar de N minutos jugados en el día. 0 = desactivado. NUNCA bloquea. */
  dailyGoalMinutes: z.number().int().min(0).max(600).default(0),
});

export const profile = z.object({
  coins: z.number().int().min(0).default(0),
  xp: z.number().int().min(0).default(0),
  unlocked: z.array(z.string()).readonly().default([]),
  equipped: z
    .object({ deck: z.string(), back: z.string(), felt: z.string() })
    .default({ deck: 'Vertical2', back: 'blueBack', felt: 'green' }),
});

export const progress = z.object({
  completedChallenges: z.array(z.string()).readonly().default([]),
  streak: z
    .object({
      current: z.number().int().min(0).default(0),
      best: z.number().int().min(0).default(0),
      lastDay: z.string().nullable().default(null),
      lifelineUsedMonth: z.string().nullable().default(null),
      lifelineJustUsed: z.boolean().default(false),
    })
    .default({ current: 0, best: 0, lastDay: null, lifelineUsedMonth: null, lifelineJustUsed: false }),
  badges: z.array(z.string()).readonly().default([]),
  stars: z.array(z.string()).readonly().default([]),
  freePlayCoins: z
    .object({ date: z.string(), coins: z.number().int().min(0) })
    .default({ date: '', coins: 0 }),
  playTime: z
    .object({ date: z.string(), seconds: z.number().min(0) })
    .default({ date: '', seconds: 0 }),
});

export const gameStats = z.object({
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  bestTime: z.number().nullable(),
  fewestMoves: z.number().nullable(),
  bestScore: z.number(),
  currentWinStreak: z.number().int().min(0),
  bestWinStreak: z.number().int().min(0),
  totalSeconds: z.number().min(0),
});

export const appData = z.object({
  schemaVersion: z.number().int().min(1),
  settings: settings.default({}),
  profile: profile.default({}),
  progress: progress.default({}),
  stats: z.record(z.string(), gameStats).default({}),
  starProgress: z.record(z.string(), z.number()).default({}),
  savedGames: z.array(savedGame).readonly().default([]),
});

export type AppData = z.infer<typeof appData>;
export type SavedGame = z.infer<typeof savedGame>;
export type Settings = z.infer<typeof settings>;
export type StoredProfile = z.infer<typeof profile>;
export type StoredProgress = z.infer<typeof progress>;

export const emptyAppData = (): AppData =>
  appData.parse({
    schemaVersion: SCHEMA_VERSION,
    settings: {},
    profile: { unlocked: ['deck:Vertical2', 'back:blueBack', 'felt:green'] },
    progress: {},
    stats: {},
    starProgress: {},
    savedGames: [],
  });

export interface ImportReport {
  readonly ok: boolean;
  readonly data?: AppData;
  readonly error?: string;
  readonly summary?: { days: number; badges: number; coins: number; games: number };
}

/**
 * Importar NUNCA pierde datos en silencio: si el fichero es de una versión antigua, se migra;
 * si es más nuevo, se RECHAZA con un mensaje claro en vez de adivinar (docs/07 §3).
 */
export function parseImport(raw: unknown): ImportReport {
  const shape = z.object({ schemaVersion: z.number().int().min(1) }).safeParse(raw);
  if (!shape.success) {
    return { ok: false, error: 'import.error.notSoledad' };
  }
  if (shape.data.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'import.error.tooNew' };
  }

  const migrated = migrate(raw, shape.data.schemaVersion);
  const parsed = appData.safeParse(migrated);
  if (!parsed.success) {
    return { ok: false, error: 'import.error.corrupt' };
  }

  const data = parsed.data;
  return {
    ok: true,
    data,
    summary: {
      days: new Set(data.progress.completedChallenges.map((id) => id.split('|')[0])).size,
      badges: data.progress.badges.length,
      coins: data.profile.coins,
      games: data.savedGames.length,
    },
  };
}

/**
 * Migraciones: `(vN) => vN+1`, puras y probadas. NUNCA se borra un dato del usuario: si un
 * campo deja de usarse se ignora, no se elimina. El coste de guardar basura es cero; el de
 * borrarle el progreso a alguien, infinito (docs/07 §2).
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 1 → 2 iría aquí el día que cambie el esquema. Ejemplo de la forma que debe tener:
  // 1: (data) => ({ ...data, schemaVersion: 2, nuevoCampo: valorPorDefecto }),
};

export function migrate(raw: unknown, from: number): unknown {
  let data = raw as Record<string, unknown>;
  for (let version = from; version < SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) break;
    data = step(data);
  }
  return { ...data, schemaVersion: SCHEMA_VERSION };
}
