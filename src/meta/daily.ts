import { fnv1a } from '../core/rng';
import { GAME_IDS, type GameId, type Variant } from '../core/types';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export type Objective =
  | { readonly kind: 'win' }
  | { readonly kind: 'winUnder'; readonly moves: number }
  | { readonly kind: 'winWithin'; readonly seconds: number }
  | { readonly kind: 'score'; readonly min: number }
  | { readonly kind: 'foundations'; readonly count: number }
  | { readonly kind: 'noUndo' }
  | { readonly kind: 'freecellsUnused'; readonly max: number };

export interface DailyChallenge {
  readonly date: string;
  readonly game: GameId;
  readonly variant: Variant;
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly objective: Objective;
  readonly reward: { readonly coins: number; readonly xp: number };
  /** ¿Sale de un reparto verificado por el solver, o de la derivación de emergencia? */
  readonly verified: boolean;
}

/**
 * `|v1` permite regenerar la tabla de retos en el futuro sin romper las semillas ya jugadas
 * (docs/04 §2). La fecha es la LOCAL del dispositivo, nunca UTC.
 */
export const dailySeed = (date: string, game: GameId, difficulty: Difficulty): number =>
  fnv1a(`${date}|${game}|${difficulty}|v1`);

const pick = <T>(items: readonly T[], salt: string): T => {
  const index = fnv1a(salt) % items.length;
  return items[index] as T;
};

/**
 * La dificultad rota a lo largo de la semana: no todos los días son difíciles, y SIEMPRE hay
 * al menos un reto fácil (docs/06 §2), para que una sesión de cinco minutos también sume.
 */
const WEEKLY_SHAPE: readonly (readonly Difficulty[])[] = [
  ['easy', 'easy', 'medium', 'medium', 'hard'],
  ['easy', 'medium', 'medium', 'hard', 'hard'],
  ['easy', 'easy', 'medium', 'hard', 'expert'],
  ['easy', 'medium', 'medium', 'medium', 'hard'],
  ['easy', 'medium', 'hard', 'hard', 'expert'],
  ['easy', 'easy', 'medium', 'medium', 'hard'],
  ['easy', 'medium', 'medium', 'hard', 'expert'],
];

/** Reparte las 5 dificultades del día entre los 5 juegos, de forma determinista. */
export function difficultiesFor(date: string): Record<GameId, Difficulty> {
  const dayOfWeek = fnv1a(`shape|${date}`) % WEEKLY_SHAPE.length;
  const shape = WEEKLY_SHAPE[dayOfWeek] as readonly Difficulty[];

  // Baraja qué juego recibe cada dificultad, sin repetir juego.
  const order = [...GAME_IDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = fnv1a(`order|${date}|${i}`) % (i + 1);
    [order[i], order[j]] = [order[j] as GameId, order[i] as GameId];
  }

  const result = {} as Record<GameId, Difficulty>;
  order.forEach((game, index) => {
    result[game] = shape[index] ?? 'medium';
  });
  return result;
}

/**
 * Variante del reto diario.
 *
 * SPIDER VA SIEMPRE A 1 PALO, y esto merece explicación porque contradice la lectura ingenua
 * de docs/06. La promesa dura del proyecto es que TODO reto diario está verificado como
 * resoluble (docs/01 §6, docs/10 fase 4). El solver demuestra Spider a 1 palo sin problema,
 * pero no consigue demostrar el de 2 palos ni con presupuestos enormes — igual que ya se
 * concedía para el de 4 palos en docs/04 §5. Entre ofrecer variedad y cumplir la promesa,
 * gana la promesa: un reto diario "no verificado" es exactamente lo que prometimos no hacer.
 *
 * Spider a 2 y 4 palos sigue entero en la partida libre y en el Club de Estrellas, donde no se
 * promete resolubilidad. La dificultad del reto sale del REPARTO (el generador busca una
 * semilla cuya dificultad medida coincida con la planificada), que es como docs/04 §5 dice que
 * debe derivarse: del análisis del solver, no de un número inventado.
 */
export function variantFor(game: GameId, difficulty: Difficulty): Variant {
  switch (game) {
    case 'klondike':
      return {
        game: 'klondike',
        draw: difficulty === 'easy' ? 1 : 3,
        maxRedeals: difficulty === 'expert' ? 2 : null,
        scoring: true,
      };
    case 'spider':
      return { game: 'spider', suits: 1 };
    case 'freecell':
      return { game: 'freecell', freeCells: difficulty === 'expert' ? 3 : 4 };
    case 'pyramid':
      return { game: 'pyramid', maxRedeals: 2, wasteSelfPairing: false };
    case 'tripeaks':
      return { game: 'tripeaks', wrapAround: difficulty !== 'expert' };
  }
}

const REWARDS: Record<Difficulty, { coins: number; xp: number }> = {
  easy: { coins: 10, xp: 20 },
  medium: { coins: 20, xp: 40 },
  hard: { coins: 35, xp: 70 },
  expert: { coins: 50, xp: 120 },
};

export const rewardFor = (difficulty: Difficulty): { coins: number; xp: number } =>
  REWARDS[difficulty];

/**
 * El objetivo no siempre es "gana": los objetivos parciales existen para que un reparto duro
 * no sea un muro (docs/06 §2). Se elige determinísticamente de (fecha, juego).
 */
export function objectiveFor(
  date: string,
  game: GameId,
  difficulty: Difficulty,
  minMoves: number,
): Objective {
  const salt = `objective|${date}|${game}`;

  const pool: Objective[] = [{ kind: 'win' }];
  if (difficulty === 'easy' || difficulty === 'medium') {
    pool.push({ kind: 'noUndo' });
    if (minMoves > 0) pool.push({ kind: 'winUnder', moves: Math.ceil(minMoves * 1.6) });
    pool.push({ kind: 'winWithin', seconds: 600 });
  }
  if (difficulty === 'hard' || difficulty === 'expert') {
    // Se puede ganar la recompensa sin ganar la partida.
    pool.push({ kind: 'foundations', count: game === 'spider' ? 3 : 2 });
    if (game === 'freecell') pool.push({ kind: 'freecellsUnused', max: 2 });
    if (game === 'tripeaks' || game === 'pyramid') pool.push({ kind: 'score', min: 200 });
  }
  return pick(pool, salt);
}

/** Formato del manifiesto generado en CI y versionado (docs/04 §5). */
export interface DailyEntry {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly verified: boolean;
  readonly minMoves: number;
}

export interface DailyManifest {
  readonly version: number;
  readonly from: string;
  readonly to: string;
  readonly deals: Readonly<Record<string, Readonly<Partial<Record<GameId, DailyEntry>>>>>;
}

/**
 * Fallback para fechas fuera del manifiesto (alguien con la app vieja en 2037): se deriva la
 * semilla de la fecha y se marca como NO verificada. La app nunca se rompe, y nunca ejecuta el
 * solver en el móvil para comprobarlo: sería quemar batería (docs/04 §5).
 */
export function challengesFor(date: string, manifest?: DailyManifest): DailyChallenge[] {
  const difficulties = difficultiesFor(date);
  const entries = manifest?.deals[date];

  return GAME_IDS.map((game) => {
    const planned = difficulties[game];
    const entry = entries?.[game];
    // La VARIANTE sale siempre de la dificultad planificada, nunca de la medida: es la que usó
    // el generador para verificar el reparto. Si saliera de la medida, el móvil montaría una
    // partida distinta de la que el solver demostró resoluble.
    const variant = variantFor(game, planned);
    const difficulty = entry?.difficulty ?? planned;

    return {
      date,
      game,
      variant,
      seed: entry?.seed ?? dailySeed(date, game, planned),
      difficulty,
      objective: objectiveFor(date, game, difficulty, entry?.minMoves ?? 0),
      reward: rewardFor(difficulty),
      verified: entry?.verified ?? false,
    };
  });
}

export const challengeId = (date: string, game: GameId): string => `${date}|${game}`;
