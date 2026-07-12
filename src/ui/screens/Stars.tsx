import { STAR_OBJECTIVES, collections, starsEarned } from '../../meta/starclub';
import * as store from '../../app/store';
import { t, type MessageKey } from '../../services/i18n';

export interface StarsProps {
  readonly onBack: () => void;
}

export function Stars({ onBack }: StarsProps): preact.JSX.Element {
  const progress = store.starProgress.value;

  return (
    <div class="screen list">
      <header class="list-head">
        <button class="icon" onClick={onBack} aria-label={t('common.back')}>
          ←
        </button>
        <h1>{t('stars.title')}</h1>
        <span class="chip">
          ⭐ {t('stars.progress', { done: starsEarned(progress), total: STAR_OBJECTIVES.length })}
        </span>
      </header>

      {collections().map((collection) => (
        <section key={collection} class="card-panel">
          <h2>{t(`stars.${collection}` as MessageKey)}</h2>
          <ul class="star-list">
            {STAR_OBJECTIVES.filter((objective) => objective.collection === collection).map(
              (objective) => {
                const count = progress[objective.id] ?? 0;
                const done = count >= objective.times;
                return (
                  <li key={objective.id} class={done ? 'star-done' : ''}>
                    <span class="star-icon">{done ? '⭐' : '☆'}</span>
                    <span class="star-text">{t(`star.${objective.id}` as MessageKey)}</span>
                    {objective.times > 1 && (
                      <span class="star-count">
                        {Math.min(count, objective.times)}/{objective.times}
                      </span>
                    )}
                    <span class="star-coins">+{objective.coins}</span>
                  </li>
                );
              },
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
