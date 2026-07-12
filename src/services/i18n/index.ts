import { signal } from '@preact/signals';
import { CATALOG, es, type Language, type MessageKey } from './messages';

export type { Language, MessageKey } from './messages';

export const language = signal<Language>('es');

export function detectLanguage(preferred: 'system' | Language): Language {
  if (preferred !== 'system') return preferred;
  const system = typeof navigator !== 'undefined' ? navigator.language : 'es';
  return system.toLowerCase().startsWith('en') ? 'en' : 'es';
}

/**
 * Una clave que falte en inglés cae al español. Nunca se enseña una clave cruda en pantalla:
 * un `home.today` en la interfaz es un fallo visible para el usuario, no para el programador.
 */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const catalog = CATALOG[language.value];
  let text: string = catalog[key] ?? es[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** Fechas y números con Intl, nunca a mano (docs/09 §6). */
export const formatDate = (date: string, options?: Intl.DateTimeFormatOptions): string => {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(language.value, { timeZone: 'UTC', ...options }).format(value);
};

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat(language.value).format(value);

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};
