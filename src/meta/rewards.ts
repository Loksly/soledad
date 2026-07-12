import type { GameId } from '../core/types';
import { challengeId, rewardFor, type DailyChallenge, type Difficulty } from './daily';
import { meetsObjective, type Outcome } from './outcome';
import { milestoneReached, monthOf, recordPlay, streakBonus, type StreakState } from './streak';

/**
 * Economía (docs/06 §4). Las monedas SÓLO se gastan en cosmética. Nunca en pistas, deshacer,
 * reintentos ni ventajas: eso sería reintroducir la fricción que este proyecto existe para
 * eliminar. No hay forma de comprar monedas: ni con dinero, ni con anuncios, ni con nada.
 */

export interface Profile {
  readonly coins: number;
  readonly xp: number;
  readonly unlocked: readonly string[];
  readonly equipped: { readonly deck: string; readonly back: string; readonly felt: string };
}

export interface Progress {
  /** `${fecha}|${juego}` de cada reto completado. Es un conjunto: reclamar dos veces el mismo
   *  día es imposible por construcción, sin necesidad de detectar trampas (docs/06 §6). */
  readonly completedChallenges: readonly string[];
  readonly streak: StreakState;
  readonly badges: readonly string[];
  readonly stars: readonly string[];
  /** Monedas ganadas hoy en partida libre, para el tope diario. */
  readonly freePlayCoins: { readonly date: string; readonly coins: number };
  /**
   * Tiempo jugado hoy. Es INFORMACIÓN, no un límite: la app no bloquea nunca, no esconde el
   * botón de jugar y no riñe a nadie. Sólo te dice cuánto llevas, que es lo que necesitas para
   * decidir tú. Cualquier cosa que se parezca a un candado aquí es un defecto (P4, P6).
   */
  readonly playTime: { readonly date: string; readonly seconds: number };
}

export const FREE_PLAY_COINS = 5;
export const FREE_PLAY_DAILY_CAP = 25;
export const ALL_FIVE_BONUS = 50;

export interface RewardResult {
  readonly profile: Profile;
  readonly progress: Progress;
  readonly earned: {
    readonly coins: number;
    readonly xp: number;
    readonly streakBonus: number;
    readonly allFiveBonus: number;
    readonly badges: readonly string[];
    readonly lifelineUsed: boolean;
    readonly levelUp: number | null;
  };
}

/** Curva suave: el nivel no desbloquea juegos ni ventajas. Sólo insignia y algún cosmético. */
export const levelFor = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
export const xpForLevel = (level: number): number => Math.pow(level - 1, 2) * 50;

export const isCompleted = (progress: Progress, date: string, game: GameId): boolean =>
  progress.completedChallenges.includes(challengeId(date, game));

/** Suma tiempo al día de hoy. Al cambiar de día el contador arranca de cero, sin arrastrar nada. */
export function addPlayTime(progress: Progress, today: string, seconds: number): Progress {
  const previous = progress.playTime.date === today ? progress.playTime.seconds : 0;
  return { ...progress, playTime: { date: today, seconds: previous + Math.max(0, seconds) } };
}

export const minutesPlayedToday = (progress: Progress, today: string): number =>
  progress.playTime.date === today ? Math.floor(progress.playTime.seconds / 60) : 0;

/**
 * Completar un reto diario. `today` es el día del reloj; `challenge.date` puede ser anterior
 * (recuperación de un día del mes en curso), y entonces NO cuenta para la racha: la racha es de
 * días jugados EN SU DÍA (docs/06 §2).
 */
export function claimChallenge(
  profile: Profile,
  progress: Progress,
  challenge: DailyChallenge,
  outcome: Outcome,
  today: string,
): RewardResult {
  const none: RewardResult['earned'] = {
    coins: 0,
    xp: 0,
    streakBonus: 0,
    allFiveBonus: 0,
    badges: [],
    lifelineUsed: false,
    levelUp: null,
  };

  if (!meetsObjective(challenge.objective, outcome)) {
    return { profile, progress, earned: none };
  }
  // Volver a jugarlo no da más recompensa (pero sí actualiza estadísticas y récords).
  if (isCompleted(progress, challenge.date, challenge.game)) {
    return { profile, progress, earned: none };
  }

  const reward = rewardFor(challenge.difficulty);
  const completed = [...progress.completedChallenges, challengeId(challenge.date, challenge.game)];

  const isToday = challenge.date === today;
  const firstOfToday =
    isToday && !progress.completedChallenges.some((id) => id.startsWith(`${today}|`));

  const streak = isToday ? recordPlay(progress.streak, today) : progress.streak;
  const bonus = firstOfToday ? streakBonus(streak.current) : 0;

  const dayCount = completed.filter((id) => id.startsWith(`${challenge.date}|`)).length;
  const allFive = dayCount === 5 ? ALL_FIVE_BONUS : 0;

  const badges = [...progress.badges];
  const newBadges: string[] = [];
  const milestone = milestoneReached(progress.streak.current, streak.current);
  if (milestone !== null && !badges.includes(`streak-${milestone}`)) {
    newBadges.push(`streak-${milestone}`);
  }
  const monthBadge = monthBadgeFor(completed, challenge.date);
  if (monthBadge && !badges.includes(monthBadge)) newBadges.push(monthBadge);

  const coins = reward.coins + bonus + allFive;
  const xp = reward.xp;
  const levelBefore = levelFor(profile.xp);
  const levelAfter = levelFor(profile.xp + xp);

  return {
    profile: { ...profile, coins: profile.coins + coins, xp: profile.xp + xp },
    progress: {
      ...progress,
      completedChallenges: completed,
      streak,
      badges: [...badges, ...newBadges],
    },
    earned: {
      coins,
      xp,
      streakBonus: bonus,
      allFiveBonus: allFive,
      badges: newBadges,
      lifelineUsed: streak.lifelineJustUsed,
      levelUp: levelAfter > levelBefore ? levelAfter : null,
    },
  };
}

const DAYS_IN_MONTH: Readonly<Record<string, number>> = {};

/** Insignia del mes: todos los días del mes con al menos un reto (los recuperados cuentan). */
function monthBadgeFor(completed: readonly string[], date: string): string | null {
  const month = monthOf(date);
  const days = new Set(
    completed.filter((id) => id.startsWith(month)).map((id) => id.split('|')[0] ?? ''),
  );
  const total = daysInMonth(month);
  return days.size >= total ? `month-${month}` : null;
}

export function daysInMonth(month: string): number {
  const cached = DAYS_IN_MONTH[month];
  if (cached !== undefined) return cached;
  const [year, m] = month.split('-').map(Number);
  // Día 0 del mes siguiente = último día de este mes. Date.UTC es puro: no lee el reloj.
  const days = new Date(Date.UTC(year ?? 1970, m ?? 1, 0)).getUTCDate();
  return days;
}

/** Partida libre: 5 monedas, con tope diario para que el grindeo no tenga sentido. */
export function claimFreePlay(
  profile: Profile,
  progress: Progress,
  outcome: Outcome,
  today: string,
): RewardResult {
  const earnedToday = progress.freePlayCoins.date === today ? progress.freePlayCoins.coins : 0;
  const room = Math.max(0, FREE_PLAY_DAILY_CAP - earnedToday);
  const coins = outcome.won ? Math.min(FREE_PLAY_COINS, room) : 0;

  return {
    profile: { ...profile, coins: profile.coins + coins },
    progress: { ...progress, freePlayCoins: { date: today, coins: earnedToday + coins } },
    earned: {
      coins,
      xp: 0,
      streakBonus: 0,
      allFiveBonus: 0,
      badges: [],
      lifelineUsed: false,
      levelUp: null,
    },
  };
}

export const emptyProfile = (): Profile => ({
  coins: 0,
  xp: 0,
  unlocked: ['deck:Vertical2', 'back:blueBack', 'felt:green'],
  equipped: { deck: 'Vertical2', back: 'blueBack', felt: 'green' },
});

export const emptyProgress = (): Progress => ({
  completedChallenges: [],
  streak: {
    current: 0,
    best: 0,
    lastDay: null,
    lifelineUsedMonth: null,
    lifelineJustUsed: false,
  },
  badges: [],
  stars: [],
  freePlayCoins: { date: '', coins: 0 },
  playTime: { date: '', seconds: 0 },
});

export const difficultyRank: Readonly<Record<Difficulty, number>> = {
  easy: 0,
  medium: 1,
  hard: 2,
  expert: 3,
};
