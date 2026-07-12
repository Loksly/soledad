import * as store from '../../app/store';
import { t, type MessageKey } from '../../services/i18n';

/**
 * Las monedas SÓLO se gastan aquí, y aquí no se vende nada que afecte a la jugabilidad
 * (docs/06 §4). No hay forma de comprar monedas: ni con dinero, ni con anuncios, ni con nada.
 * Se dice en voz alta en la propia pantalla.
 */

interface Item {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly price: number;
  readonly kind: 'deck' | 'back' | 'felt';
  readonly value: string;
  /** Sólo los mazos ya presentes en assets/cards/. No se inventa arte nuevo. */
  readonly preview?: string;
}

const ITEMS: readonly Item[] = [
  { id: 'deck:Vertical2', labelKey: 'shop.decks', price: 0, kind: 'deck', value: 'Vertical2' },
  { id: 'deck:Vertical4', labelKey: 'shop.decks', price: 150, kind: 'deck', value: 'Vertical4' },
  { id: 'deck:Horizontal2', labelKey: 'shop.decks', price: 200, kind: 'deck', value: 'Horizontal2' },
  { id: 'deck:Horizontal4', labelKey: 'shop.decks', price: 200, kind: 'deck', value: 'Horizontal4' },
  // El mazo accesible es GRATIS y siempre lo será: cobrar por poder distinguir los palos sería
  // vender accesibilidad (docs/09 §5).
  { id: 'deck:Accessible/Vertical', labelKey: 'shop.decks', price: 0, kind: 'deck', value: 'Accessible/Vertical' },
  { id: 'deck:Accessible/Horizontal', labelKey: 'shop.decks', price: 0, kind: 'deck', value: 'Accessible/Horizontal' },

  { id: 'back:blueBack', labelKey: 'shop.backs', price: 0, kind: 'back', value: 'blueBack' },
  { id: 'back:redBack', labelKey: 'shop.backs', price: 60, kind: 'back', value: 'redBack' },

  { id: 'felt:green', labelKey: 'shop.felts', price: 0, kind: 'felt', value: 'green' },
  { id: 'felt:blue', labelKey: 'shop.felts', price: 80, kind: 'felt', value: 'blue' },
  { id: 'felt:slate', labelKey: 'shop.felts', price: 80, kind: 'felt', value: 'slate' },
  { id: 'felt:wine', labelKey: 'shop.felts', price: 120, kind: 'felt', value: 'wine' },
];

export interface ShopProps {
  readonly onBack: () => void;
}

export function Shop({ onBack }: ShopProps): preact.JSX.Element {
  const profile = store.profile.value;
  const settings = store.settings.value;

  const equipped = (item: Item): boolean =>
    (item.kind === 'deck' && settings.deck === item.value) ||
    (item.kind === 'back' && settings.back === item.value) ||
    (item.kind === 'felt' && settings.felt === item.value);

  const act = (item: Item): void => {
    const owned = item.price === 0 || profile.unlocked.includes(item.id);
    if (!owned) {
      store.buy(item.id, item.price);
      return;
    }
    store.updateSettings({ [item.kind]: item.value });
  };

  const groups: { key: MessageKey; kind: Item['kind'] }[] = [
    { key: 'shop.decks', kind: 'deck' },
    { key: 'shop.backs', kind: 'back' },
    { key: 'shop.felts', kind: 'felt' },
  ];

  return (
    <div class="screen list">
      <header class="list-head">
        <button class="icon" onClick={onBack} aria-label={t('common.back')}>
          ←
        </button>
        <h1>{t('shop.title')}</h1>
        <span class="chip">🪙 {profile.coins}</span>
      </header>

      <p class="muted hint">{t('shop.noRealMoney')}</p>

      {groups.map((group) => (
        <section key={group.kind} class="card-panel">
          <h2>{t(group.key)}</h2>
          <ul class="shop-list">
            {ITEMS.filter((item) => item.kind === group.kind).map((item) => {
              const owned = item.price === 0 || profile.unlocked.includes(item.id);
              const isEquipped = equipped(item);
              const affordable = profile.coins >= item.price;

              return (
                <li key={item.id}>
                  <span class="shop-name">{item.value}</span>
                  <button
                    class={isEquipped ? 'chip chip-on' : 'chip'}
                    disabled={!owned && !affordable}
                    onClick={() => act(item)}
                  >
                    {isEquipped
                      ? t('shop.equipped')
                      : owned
                        ? t('shop.equip')
                        : affordable
                          ? `${t('shop.buy')} · ${item.price}`
                          : t('shop.cantAfford')}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
