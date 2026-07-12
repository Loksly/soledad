import { useEffect, useState } from 'preact/hooks';
import type { Earned } from '../../app/store';
import type { DailyChallenge } from '../../meta/daily';
import { formatDuration, t, type MessageKey } from '../../services/i18n';

/**
 * La celebración es BREVE (2 s) y se puede saltar tocando (docs/05 §6). Nadie quiere ver
 * confeti por 400.ª vez, y menos si tiene prisa por jugar otra.
 */

export interface WinOverlayProps {
  readonly earned: Earned;
  readonly challenge: DailyChallenge | null;
  readonly seconds: number;
  readonly moves: number;
  readonly onAgain: () => void;
  readonly onHome: () => void;
}

export function WinOverlay({
  earned,
  challenge,
  seconds,
  moves,
  onAgain,
  onHome,
}: WinOverlayProps): preact.JSX.Element {
  const [celebrating, setCelebrating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setCelebrating(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="overlay" onClick={() => setCelebrating(false)}>
      <div class={`dialog win${celebrating ? ' celebrating' : ''}`}>
        <h2>{t('win.title')}</h2>

        <p class="win-line">
          {formatDuration(seconds)} · {moves} {t('board.moves').toLowerCase()}
        </p>

        {earned.challengeDone && challenge && <p class="win-badge">{t('win.challengeDone')}</p>}

        <ul class="win-rewards">
          {earned.coins > 0 && <li>{t('win.coins', { n: earned.coins })}</li>}
          {earned.xp > 0 && <li>{t('win.xp', { n: earned.xp })}</li>}
          {earned.streakBonus > 0 && <li>{t('win.streakBonus', { n: earned.streakBonus })}</li>}
          {earned.allFiveBonus > 0 && <li>{t('win.allFive', { n: earned.allFiveBonus })}</li>}
          {earned.levelUp !== null && <li>{t('win.levelUp', { n: earned.levelUp })}</li>}
          {earned.stars.map((id) => (
            <li key={id}>⭐ {t(`star.${id}` as MessageKey)}</li>
          ))}
        </ul>

        {/* Sin lenguaje de culpa. Nunca. */}
        {earned.lifelineUsed && <p class="win-lifeline">{t('win.lifeline')}</p>}

        <div class="win-actions">
          <button class="primary" onClick={onAgain}>
            {t('win.again')}
          </button>
          <button onClick={onHome}>{t('win.home')}</button>
        </div>
      </div>
    </div>
  );
}
