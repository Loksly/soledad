import { challengesFor, type DailyChallenge } from '../../meta/daily';
import { isCompleted } from '../../meta/rewards';
import { daysInMonth } from '../../meta/rewards';
import * as store from '../../app/store';
import { manifest } from '../../app/dailies';
import { formatDate, t, type MessageKey } from '../../services/i18n';
import { describeObjective } from '../../meta/outcome';

/**
 * Calendario mensual. Los días pasados del MES EN CURSO se pueden recuperar: no se pierde el
 * mes por un despiste (docs/06 §2). No cuentan para la racha, y eso se dice, no se esconde.
 *
 * No hay cuenta atrás a medianoche presionando a terminar. Deliberadamente.
 */

export interface DailyProps {
  readonly today: string;
  readonly onPlay: (challenge: DailyChallenge) => void;
  readonly onBack: () => void;
}

export function Daily({ today, onPlay, onBack }: DailyProps): preact.JSX.Element {
  const month = today.slice(0, 7);
  const total = daysInMonth(month);
  const progress = store.progress.value;

  const days = Array.from({ length: total }, (_, index) => {
    const day = `${month}-${String(index + 1).padStart(2, '0')}`;
    const challenges = challengesFor(day, manifest());
    const done = challenges.filter((challenge) => isCompleted(progress, day, challenge.game)).length;
    return { day, challenges, done, future: day > today };
  });

  const selected = days.find((entry) => entry.day === today);

  return (
    <div class="screen list">
      <header class="list-head">
        <button class="icon" onClick={onBack} aria-label={t('common.back')}>
          ←
        </button>
        <h1>{t('daily.title')}</h1>
      </header>

      <div class="streak-row">
        <div>
          <strong>{progress.streak.current}</strong>
          <span>{t('daily.streak')}</span>
        </div>
        <div>
          <strong>{progress.streak.best}</strong>
          <span>{t('daily.best')}</span>
        </div>
      </div>

      <div class="calendar" role="grid">
        {days.map((entry) => (
          <div
            key={entry.day}
            class={
              `day${entry.done === 5 ? ' day-full' : entry.done > 0 ? ' day-partial' : ''}` +
              `${entry.future ? ' day-future' : ''}${entry.day === today ? ' day-today' : ''}`
            }
            aria-label={formatDate(entry.day)}
          >
            {entry.day.slice(-2)}
          </div>
        ))}
      </div>

      <p class="muted hint">{t('daily.recoverHint')}</p>

      {selected && (
        <ul class="challenge-list">
          {selected.challenges.map((challenge) => {
            const complete = isCompleted(progress, challenge.date, challenge.game);
            const objective = describeObjective(challenge.objective);
            return (
              <li key={challenge.game}>
                <button
                  class={`challenge${complete ? ' challenge-done' : ''}`}
                  onClick={() => onPlay(challenge)}
                >
                  <span class={`badge badge-${challenge.difficulty}`}>
                    {t(`difficulty.${challenge.difficulty}` as MessageKey)}
                  </span>
                  <span class="challenge-game">{t(`game.${challenge.game}` as MessageKey)}</span>
                  <span class="challenge-objective">
                    {t(objective.key as MessageKey, { n: objective.value })}
                    {!challenge.verified && ` · ${t('daily.unverified')}`}
                  </span>
                  <span class="challenge-reward">
                    {complete ? t('daily.done') : t('daily.play')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
