import { useState } from 'preact/hooks';
import { VARIANTS_OF } from '../../core/games';
import { randomSeed } from '../../core/rng';
import type { GameId, Variant } from '../../core/types';
import { t, type MessageKey } from '../../services/i18n';

/**
 * Partida libre: cualquier juego, cualquier variante, y "jugar el reparto n.º 12345"
 * (docs/01 §4.3). Lo de la semilla a mano no es un capricho: es lo que permite a dos personas
 * jugar exactamente el mismo tablero sin servidor, y lo que hace depurable un fallo reportado.
 */

const variantKey = (variant: Variant): MessageKey => {
  switch (variant.game) {
    case 'klondike':
      return variant.draw === 1
        ? 'variant.klondike.draw1'
        : variant.maxRedeals === null
          ? 'variant.klondike.draw3'
          : 'variant.klondike.draw3limited';
    case 'spider':
      return `variant.spider.${variant.suits}` as MessageKey;
    case 'freecell':
      return `variant.freecell.${variant.freeCells}` as MessageKey;
    case 'pyramid':
      return `variant.pyramid.${variant.maxRedeals}` as MessageKey;
    case 'tripeaks':
      return variant.wrapAround ? 'variant.tripeaks.wrap' : 'variant.tripeaks.strict';
  }
};

export interface NewGameProps {
  readonly game: GameId;
  readonly onStart: (variant: Variant, seed: number) => void;
  readonly onCancel: () => void;
}

export function NewGame({ game, onStart, onCancel }: NewGameProps): preact.JSX.Element {
  const variants = VARIANTS_OF[game];
  const [chosen, setChosen] = useState(0);
  const [seedText, setSeedText] = useState('');

  const start = (): void => {
    // Sin semilla escrita, una al azar. Con semilla, EXACTAMENTE ese reparto: es lo que permite
    // que dos personas jueguen el mismo tablero sin servidor.
    const typed = Number.parseInt(seedText, 10);
    const seed = Number.isFinite(typed) && typed >= 0 ? typed >>> 0 : randomSeed();
    const variant = variants[chosen] ?? variants[0];
    if (variant) onStart(variant, seed);
  };

  return (
    <div class="overlay" role="dialog">
      <div class="dialog">
        <h2>{t(`game.${game}` as MessageKey)}</h2>

        <ul class="variant-list">
          {variants.map((variant, index) => (
            <li key={variantKey(variant)}>
              <button
                class={index === chosen ? 'chip chip-on' : 'chip'}
                onClick={() => setChosen(index)}
              >
                {t(variantKey(variant))}
              </button>
            </li>
          ))}
        </ul>

        <label class="row">
          <span>{t('common.seed', { n: '' })}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={seedText}
            placeholder="—"
            onInput={(event) => setSeedText((event.target as HTMLInputElement).value)}
          />
        </label>

        <button class="primary" onClick={start}>
          {t('daily.play')}
        </button>
        <button onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}
