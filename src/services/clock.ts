/**
 * LA ÚNICA fuente de "hoy" del proyecto (docs/04 §2).
 *
 * `new Date()` está prohibido en todo el código salvo aquí (regla de ESLint que rompe la build).
 * Sin esto ni los retos diarios son iguales en todos los dispositivos ni las pruebas son fiables.
 *
 * El día es el del calendario LOCAL del dispositivo, nunca UTC: quien juega a las 23:30 en
 * Madrid está jugando el reto de hoy, no el de mañana.
 */

export interface Clock {
  /** "YYYY-MM-DD" en hora local. */
  today(): string;
  /** Milisegundos desde época. Sólo para medir duraciones de partida. */
  now(): number;
  /** Reloj monótono: no retrocede aunque el usuario cambie la hora (docs/06 §6). */
  monotonic(): number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const systemClock: Clock = {
  today: () => formatLocalDate(new Date()),
  now: () => Date.now(),
  monotonic: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

/** Reloj de pruebas: la fecha se inyecta y se mueve a mano. */
export function fixedClock(date: string, startedAt = 0): Clock & { set(date: string): void; advance(ms: number): void } {
  let current = date;
  let elapsed = startedAt;
  return {
    today: () => current,
    now: () => elapsed,
    monotonic: () => elapsed,
    set: (next: string) => {
      current = next;
    },
    advance: (ms: number) => {
      elapsed += ms;
    },
  };
}

/** Suma días a una fecha "YYYY-MM-DD" sin tocar el reloj del sistema. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

export const isBefore = (a: string, b: string): boolean => a < b;
export const sameMonth = (a: string, b: string): boolean => a.slice(0, 7) === b.slice(0, 7);
