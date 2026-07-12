/**
 * Racha = días naturales consecutivos con AL MENOS un reto completado (docs/06 §3).
 *
 * Principio rector, y no es negociable: recompensar la vuelta, NUNCA castigar la ausencia.
 * Perder la racha no borra monedas, insignias, niveles ni estadísticas: sólo reinicia el
 * contador de días. Cualquier cambio aquí que castigue al usuario es un defecto, no una mejora.
 */

export interface StreakState {
  readonly current: number;
  readonly best: number;
  /** Último día (YYYY-MM-DD) en que se completó un reto EN SU DÍA. */
  readonly lastDay: string | null;
  /** Mes natural (YYYY-MM) en que se gastó el salvavidas. Uno al mes, gratis, sin pedirlo. */
  readonly lifelineUsedMonth: string | null;
  /** Se activa cuando el salvavidas ha salvado la racha: la UI lo cuenta con cariño. */
  readonly lifelineJustUsed: boolean;
}

export const emptyStreak = (): StreakState => ({
  current: 0,
  best: 0,
  lastDay: null,
  lifelineUsedMonth: null,
  lifelineJustUsed: false,
});

const MS_PER_DAY = 86_400_000;

/** Diferencia en días naturales. Sin `new Date()` en el núcleo: se parsea la cadena a mano. */
export function daysBetween(from: string, to: string): number {
  const parse = (date: string): number => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((parse(to) - parse(from)) / MS_PER_DAY);
}

export const monthOf = (date: string): string => date.slice(0, 7);

/**
 * Registra que hoy se completó un reto. Idempotente: llamarlo dos veces el mismo día no
 * incrementa la racha (y eso hace innecesario "detectar" nada raro con el reloj: docs/06 §6).
 */
export function recordPlay(streak: StreakState, today: string): StreakState {
  if (streak.lastDay === today) return { ...streak, lifelineJustUsed: false };

  if (streak.lastDay === null) {
    return { ...streak, current: 1, best: Math.max(1, streak.best), lastDay: today, lifelineJustUsed: false };
  }

  const gap = daysBetween(streak.lastDay, today);

  // El reloj retrocedió (viaje, cambio manual): no se toca la racha ni se castiga a nadie.
  if (gap <= 0) return { ...streak, lifelineJustUsed: false };

  if (gap === 1) {
    const current = streak.current + 1;
    return { ...streak, current, best: Math.max(current, streak.best), lastDay: today, lifelineJustUsed: false };
  }

  // Se saltó exactamente un día y el salvavidas del mes sigue disponible: la racha continúa.
  const month = monthOf(today);
  if (gap === 2 && streak.lifelineUsedMonth !== month) {
    const current = streak.current + 1;
    return {
      current,
      best: Math.max(current, streak.best),
      lastDay: today,
      lifelineUsedMonth: month,
      lifelineJustUsed: true,
    };
  }

  return {
    ...streak,
    current: 1,
    best: Math.max(1, streak.best), // La racha máxima NUNCA se pierde.
    lastDay: today,
    lifelineJustUsed: false,
  };
}

/** Bonus con tope: la racha no debe convertirse en la única razón de jugar (docs/06 §4). */
export const streakBonus = (streak: number): number => Math.min(50, 5 * Math.max(0, streak));

export const STREAK_MILESTONES: readonly number[] = [7, 30, 100, 365];

export const milestoneReached = (before: number, after: number): number | null =>
  STREAK_MILESTONES.find((milestone) => before < milestone && after >= milestone) ?? null;
