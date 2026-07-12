import { GAME_IDS } from '../../core/types';
import { summaryFor, winRate } from '../../meta/stats';
import * as store from '../../app/store';
import { formatDuration, t, type MessageKey } from '../../services/i18n';

export interface StatsProps {
  readonly onBack: () => void;
}

export function Stats({ onBack }: StatsProps): preact.JSX.Element {
  const stats = store.stats.value;

  return (
    <div class="screen list">
      <header class="list-head">
        <button class="icon" onClick={onBack} aria-label={t('common.back')}>
          ←
        </button>
        <h1>{t('stats.title')}</h1>
      </header>

      {GAME_IDS.map((game) => {
        const summary = summaryFor(stats, game);
        return (
          <section key={game} class="card-panel">
            <h2>{t(`game.${game}` as MessageKey)}</h2>
            {summary.played === 0 ? (
              <p class="muted">{t('stats.none')}</p>
            ) : (
              <dl class="stat-grid">
                <div>
                  <dt>{t('stats.played')}</dt>
                  <dd>{summary.played}</dd>
                </div>
                <div>
                  <dt>{t('stats.won')}</dt>
                  <dd>{summary.won}</dd>
                </div>
                <div>
                  <dt>{t('stats.winRate')}</dt>
                  <dd>{Math.round(winRate(summary) * 100)}%</dd>
                </div>
                <div>
                  <dt>{t('stats.bestTime')}</dt>
                  <dd>{summary.bestTime === null ? '—' : formatDuration(summary.bestTime)}</dd>
                </div>
                <div>
                  <dt>{t('stats.fewestMoves')}</dt>
                  <dd>{summary.fewestMoves ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('stats.bestStreak')}</dt>
                  <dd>{summary.bestWinStreak}</dd>
                </div>
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
