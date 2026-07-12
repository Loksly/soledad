import { batch, signal } from '@preact/signals';
import type { Repository } from '../services/storage/repository';
import { emptyAppData, type AppData, type SavedGame, type Settings } from '../services/storage/schema';
import type { Session } from '../core/history';
import {
  addPlayTime,
  claimChallenge,
  claimFreePlay,
  emptyProfile,
  emptyProgress,
  minutesPlayedToday,
  type Profile,
  type Progress,
} from '../meta/rewards';
import { advance, type StarProgress } from '../meta/starclub';
import { record, type StatsByGame } from '../meta/stats';
import type { Outcome } from '../meta/outcome';
import type { DailyChallenge } from '../meta/daily';
import type { Clock } from '../services/clock';
import { configureFeedback } from '../services/feedback';
import { detectLanguage, language, t } from '../services/i18n';
import { syncReminder } from '../services/reminder';

/**
 * El estado persistido de la app. La única capa que habla con el `Repository`.
 *
 * Autoguardado: en cada movimiento con debounce de 400 ms, y SIEMPRE e inmediatamente al pasar
 * a segundo plano. Android mata el proceso sin avisar; perder una partida a medias es un
 * defecto grave (docs/07 §2, docs/09 §8 nº 9).
 */

export const settings = signal<Settings>(emptyAppData().settings);
export const profile = signal<Profile>(emptyProfile());
export const progress = signal<Progress>(emptyProgress());
export const stats = signal<StatsByGame>({});
export const starProgress = signal<StarProgress>({});
export const savedGames = signal<readonly SavedGame[]>([]);

let repo: Repository | null = null;
let clock: Clock | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function attach(repository: Repository, injectedClock: Clock): void {
  repo = repository;
  clock = injectedClock;
}

const snapshot = (): AppData => ({
  schemaVersion: emptyAppData().schemaVersion,
  settings: settings.value,
  profile: profile.value,
  progress: progress.value,
  stats: stats.value,
  starProgress: starProgress.value,
  savedGames: [...savedGames.value],
});

export async function hydrate(): Promise<void> {
  if (!repo) return;
  const data = await repo.load();
  batch(() => {
    settings.value = data.settings;
    profile.value = data.profile;
    progress.value = data.progress;
    stats.value = data.stats;
    starProgress.value = data.starProgress;
    savedGames.value = data.savedGames;
    language.value = detectLanguage(data.settings.language);
  });
  configureFeedback({ sound: data.settings.sound, haptics: data.settings.haptics });
  applyTheme(data.settings);
}

/** Guardado inmediato. Se usa en `pause`/`visibilitychange`: no se puede esperar al debounce. */
export async function flush(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await repo?.save(snapshot());
}

export function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void repo?.save(snapshot());
  }, 400);
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  configureFeedback({ sound: settings.value.sound, haptics: settings.value.haptics });
  if (patch.language) language.value = detectLanguage(settings.value.language);
  if (patch.dailyReminder !== undefined) {
    // El permiso de notificaciones se pide AQUÍ, al activarlo, no al arrancar la app.
    syncReminder(patch.dailyReminder, t('reminder.title'), t('reminder.body'));
  }
  applyTheme(settings.value);
  scheduleSave();
}

function applyTheme(current: Settings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset['theme'] = current.theme;
  root.dataset['felt'] = current.felt;
  root.dataset['hand'] = current.leftHanded ? 'left' : 'right';
  root.dataset['motion'] = current.animations ? 'full' : 'reduced';
}

/**
 * UNA partida en curso por tipo de juego (más una por reto diario).
 *
 * Antes la clave incluía la semilla (`free:klondike:912345`), así que cada partida nueva creaba
 * una entrada distinta y la de antes quedaba sepultada en una lista que el jugador no veía:
 * en la práctica, empezar a jugar era perder lo que tenías a medias. Ahora `free:klondike` es
 * un único hueco que se sobrescribe, y la app puede ofrecerte "seguir donde lo dejaste" en cada
 * uno de los cinco juegos.
 */
export const gameKey = (session: Session, challengeDate: string | null): string =>
  challengeDate ? `daily:${challengeDate}:${session.game}` : `free:${session.game}`;

/** La partida libre en curso de ese juego, si la hay. */
export const savedFor = (game: Session['game']): SavedGame | undefined =>
  savedGames.value.find((entry) => entry.challengeDate === null && entry.game === game);

export function saveSession(session: Session, seconds: number, challengeDate: string | null): void {
  const saved: SavedGame = {
    id: gameKey(session, challengeDate),
    game: session.game,
    variant: session.variant,
    seed: session.seed,
    moves: [...session.moves],
    cursor: session.cursor,
    undosUsed: session.undosUsed,
    hintsUsed: session.hintsUsed,
    seconds,
    updatedAt: clock?.now() ?? 0,
    challengeDate,
  };
  savedGames.value = [saved, ...savedGames.value.filter((entry) => entry.id !== saved.id)].slice(0, 20);
  scheduleSave();
}

/**
 * Suma los segundos jugados desde la última vez. Se llama al guardar la partida (en cada
 * movimiento, al salir y al pasar a segundo plano), no en cada tic del reloj: escribir en disco
 * una vez por segundo sería tirar batería para nada.
 *
 * Esto NO limita nada. La app no bloquea, no esconde el botón de jugar y no riñe a nadie: sólo
 * te dice cuánto llevas hoy, que es lo que hace falta para decidir tú (P4/P6).
 */
export function recordPlayTime(seconds: number): void {
  if (seconds <= 0) return;
  progress.value = addPlayTime(progress.value, clock?.today() ?? '', seconds);
  scheduleSave();
}

export const minutesToday = (): number =>
  minutesPlayedToday(progress.value, clock?.today() ?? '');

export function dropSession(id: string): void {
  savedGames.value = savedGames.value.filter((entry) => entry.id !== id);
  scheduleSave();
}

export interface Earned {
  readonly coins: number;
  readonly xp: number;
  readonly streakBonus: number;
  readonly allFiveBonus: number;
  readonly badges: readonly string[];
  readonly stars: readonly string[];
  readonly lifelineUsed: boolean;
  readonly levelUp: number | null;
  readonly challengeDone: boolean;
}

/**
 * Cierra una partida: estadísticas, Club de Estrellas y (si era un reto) su recompensa.
 * Perder la racha NO reduce monedas ni insignias: aquí no se resta nada, nunca (P6).
 */
export function finishGame(outcome: Outcome, challenge: DailyChallenge | null): Earned {
  const today = clock?.today() ?? '';
  stats.value = record(stats.value, outcome);

  const stars = advance(starProgress.value, outcome);
  starProgress.value = stars.progress;

  let earned: Earned = {
    coins: stars.coins,
    xp: 0,
    streakBonus: 0,
    allFiveBonus: 0,
    badges: [],
    stars: stars.completed.map((objective) => objective.id),
    lifelineUsed: false,
    levelUp: null,
  challengeDone: false,
  };

  if (challenge) {
    const result = claimChallenge(profile.value, progress.value, challenge, outcome, today);
    const done = result.progress.completedChallenges.length > progress.value.completedChallenges.length;
    profile.value = { ...result.profile, coins: result.profile.coins + stars.coins };
    progress.value = result.progress;
    earned = {
      ...earned,
      coins: result.earned.coins + stars.coins,
      xp: result.earned.xp,
      streakBonus: result.earned.streakBonus,
      allFiveBonus: result.earned.allFiveBonus,
      badges: result.earned.badges,
      lifelineUsed: result.earned.lifelineUsed,
      levelUp: result.earned.levelUp,
      challengeDone: done,
    };
  } else {
    const result = claimFreePlay(profile.value, progress.value, outcome, today);
    profile.value = { ...result.profile, coins: result.profile.coins + stars.coins };
    progress.value = result.progress;
    earned = { ...earned, coins: result.earned.coins + stars.coins };
  }

  // Un progreso ganado que se pierde porque el proceso muere es imperdonable: se escribe ya.
  void flush();
  return earned;
}

export function buy(item: string, price: number): boolean {
  if (profile.value.unlocked.includes(item)) return false;
  if (profile.value.coins < price) return false;
  profile.value = {
    ...profile.value,
    coins: profile.value.coins - price,
    unlocked: [...profile.value.unlocked, item],
  };
  scheduleSave();
  return true;
}

export async function replaceAll(data: AppData): Promise<void> {
  batch(() => {
    settings.value = data.settings;
    profile.value = data.profile;
    progress.value = data.progress;
    stats.value = data.stats;
    starProgress.value = data.starProgress;
    savedGames.value = data.savedGames;
  });
  applyTheme(data.settings);
  await flush();
}

export const exportData = (): string => JSON.stringify(snapshot(), null, 2);
