import { GAME_IDS, type GameId } from '../../core/types';
import { challengesFor, type DailyChallenge } from '../../meta/daily';
import { isCompleted, levelFor, minutesPlayedToday } from '../../meta/rewards';
import { describeObjective } from '../../meta/outcome';
import * as store from '../../app/store';
import { t, type MessageKey } from '../../services/i18n';
import { manifest } from '../../app/dailies';

/**
 * Inicio: los retos de hoy ARRIBA, lo primero que se ve. Después los cinco juegos, y una
 * tarjeta de "Continuar" si hay partida. Nada más: sin carrusel de novedades, sin promociones,
 * sin banners (docs/05 §5).
 */

export interface HomeProps {
  readonly today: string;
  readonly onPlayChallenge: (challenge: DailyChallenge) => void;
  /** Tocar el juego: continúa la partida a medias, si la hay. */
  readonly onPlayFree: (game: GameId) => void;
  /** Repartir de cero, pisando la partida a medias de ese juego. */
  readonly onNewGame: (game: GameId) => void;
  readonly onResume: (id: string) => void;
  readonly onOpen: (screen: 'daily' | 'stats' | 'stars' | 'shop' | 'settings') => void;
}

export function Home({
  today,
  onPlayChallenge,
  onPlayFree,
  onNewGame,
  onResume,
  onOpen,
}: HomeProps): preact.JSX.Element {
  const challenges = challengesFor(today, manifest());
  const progress = store.progress.value;
  const profile = store.profile.value;

  // Los retos diarios a medias se ofrecen aparte, arriba: son los que caducan.
  const resumableDaily = store.savedGames.value.filter((entry) => entry.challengeDate !== null);
  const done = challenges.filter((challenge) => isCompleted(progress, today, challenge.game)).length;

  const minutes = minutesPlayedToday(progress, today);
  const goal = store.settings.value.dailyGoalMinutes;
  const overGoal = goal > 0 && minutes >= goal;
  const playedText =
    goal > 0
      ? t('home.playedTodayGoal', { n: minutes, goal })
      : t('home.playedToday', { n: minutes });

  return (
    <div class="screen home">
      <header class="home-header">
        <div>
          <h1>{t('app.name')}</h1>
          <p class="muted">{t('app.tagline')}</p>
        </div>
        <button class="chip" onClick={() => onOpen('shop')} aria-label={t('shop.title')}>
          🪙 {profile.coins}
        </button>
      </header>

      <section class="card-panel">
        <div class="panel-head">
          <h2>{t('home.today')}</h2>
          <button class="link" onClick={() => onOpen('daily')}>
            {progress.streak.current > 0
              ? t('home.streak', { n: progress.streak.current })
              : t('home.noStreak')}
          </button>
        </div>

        {done === 5 && <p class="done-all">{t('home.allDone')}</p>}
        {overGoal && <p class="over-goal">{t('home.overGoal', { goal })}</p>}

        <ul class="challenge-list">
          {challenges.map((challenge) => {
            const complete = isCompleted(progress, today, challenge.game);
            const objective = describeObjective(challenge.objective);
            return (
              <li key={challenge.game}>
                <button
                  class={`challenge${complete ? ' challenge-done' : ''}`}
                  onClick={() => onPlayChallenge(challenge)}
                >
                  <span class={`badge badge-${challenge.difficulty}`}>
                    {t(`difficulty.${challenge.difficulty}` as MessageKey)}
                  </span>
                  <span class="challenge-game">{t(`game.${challenge.game}` as MessageKey)}</span>
                  <span class="challenge-objective">
                    {t(objective.key as MessageKey, { n: objective.value })}
                  </span>
                  <span class="challenge-reward">{complete ? '✓' : `+${challenge.reward.coins}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {resumableDaily.map((saved) => (
        <button key={saved.id} class="resume" onClick={() => onResume(saved.id)}>
          <span>{t('home.continue')}</span>
          <strong>{t(`game.${saved.game}` as MessageKey)}</strong>
        </button>
      ))}

      <section class="card-panel">
        <h2>{t('home.freePlay')}</h2>
        <div class="game-grid">
          {GAME_IDS.map((game) => {
            // Una partida a medias por juego. La ficha lo dice, y tocarla la RETOMA: nunca más
            // se pierde un tablero por tocar el juego al que estabas jugando. Para repartir de
            // cero está el botón de al lado, que hay que pedir a propósito.
            const saved = store.savedFor(game);
            return (
              <div key={game} class="game-tile-wrap">
                <button class={`game-tile game-${game}`} onClick={() => onPlayFree(game)}>
                  <span>{t(`game.${game}` as MessageKey)}</span>
                  {saved && <small>{t('home.inProgress', { n: saved.cursor })}</small>}
                </button>
                <button
                  class="game-new"
                  onClick={() => onNewGame(game)}
                  aria-label={t('board.newGame')}
                  title={t('board.newGame')}
                >
                  ＋
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <nav class="home-nav">
        <button onClick={() => onOpen('daily')}>{t('daily.title')}</button>
        <button onClick={() => onOpen('stars')}>{t('stars.title')}</button>
        <button onClick={() => onOpen('stats')}>{t('stats.title')}</button>
        <button onClick={() => onOpen('settings')}>{t('settings.title')}</button>
      </nav>

      {/*
        Cuánto llevas jugado hoy. Es INFORMACIÓN, no un límite: no hay barra que se llene, no hay
        cuenta atrás, no hay botón que se apague. Pasarse del aviso que tú mismo te pusiste no
        tiene ninguna consecuencia, y el texto lo dice en voz alta. Un contador de tiempo que
        presione sería exactamente la clase de manipulación que este proyecto existe para no
        hacer (P4/P6).
      */}
      <footer class="level">
        <span>{playedText}</span>
        <span>
          {t('common.level', { n: levelFor(profile.xp) })} · {profile.xp} XP
        </span>
      </footer>
    </div>
  );
}
