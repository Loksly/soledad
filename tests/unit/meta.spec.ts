import { describe, expect, it } from 'vitest';
import { challengesFor, dailySeed, difficultiesFor, objectiveFor, variantFor } from '../../src/meta/daily';
import { emptyStreak, recordPlay, streakBonus, daysBetween } from '../../src/meta/streak';
import {
  ALL_FIVE_BONUS,
  claimChallenge,
  claimFreePlay,
  emptyProfile,
  emptyProgress,
  FREE_PLAY_DAILY_CAP,
  isCompleted,
  levelFor,
  addPlayTime,
  minutesPlayedToday,
  type Profile,
  type Progress,
} from '../../src/meta/rewards';
import { meetsObjective } from '../../src/meta/outcome';
import { record, merge, emptyStats, summaryFor } from '../../src/meta/stats';
import { advance } from '../../src/meta/starclub';
import { GAME_IDS } from '../../src/core/types';
import type { Outcome } from '../../src/meta/outcome';
import { fixedClock } from '../../src/services/clock';

const outcome = (patch: Partial<Outcome> = {}): Outcome => ({
  game: 'klondike',
  variant: { game: 'klondike', draw: 1, maxRedeals: null, scoring: true },
  seed: 1,
  won: true,
  moves: 100,
  seconds: 300,
  score: 500,
  undosUsed: 0,
  hintsUsed: 0,
  foundations: 4,
  freeCellsUsed: 0,
  bestChain: 0,
  stockDeals: 0,
  ...patch,
});

describe('retos diarios', () => {
  it('el reto del 2027-03-03 es idéntico en 100 ejecuciones', () => {
    const clock = fixedClock('2027-03-03');
    const first = JSON.stringify(challengesFor(clock.today()));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(challengesFor(clock.today()))).toBe(first);
    }
  });

  it('dos dispositivos en modo avión ofrecen exactamente lo mismo', () => {
    // Sin manifiesto y sin red: la semilla se deriva sólo de la fecha.
    const madrid = challengesFor('2026-12-25');
    const tokyo = challengesFor('2026-12-25');
    expect(madrid).toStrictEqual(tokyo);
    expect(madrid.map((challenge) => challenge.seed)).toEqual(
      GAME_IDS.map((game) => dailySeed('2026-12-25', game, difficultiesFor('2026-12-25')[game])),
    );
  });

  it('siempre hay al menos un reto fácil al día', () => {
    for (let day = 1; day <= 60; day++) {
      const date = `2026-${String(Math.ceil(day / 30)).padStart(2, '0')}-${String(((day - 1) % 30) + 1).padStart(2, '0')}`;
      const difficulties = Object.values(difficultiesFor(date));
      expect(difficulties, date).toContain('easy');
    }
  });

  it('ofrece exactamente 5 retos, uno por juego', () => {
    const challenges = challengesFor('2026-07-13');
    expect(challenges).toHaveLength(5);
    expect(new Set(challenges.map((challenge) => challenge.game)).size).toBe(5);
  });

  it('la variante sale de la dificultad planificada, no de la medida', () => {
    // Si saliera de la medida, el móvil montaría una partida distinta de la verificada.
    const planned = difficultiesFor('2026-08-01');
    const challenges = challengesFor('2026-08-01');
    for (const challenge of challenges) {
      expect(challenge.variant).toStrictEqual(variantFor(challenge.game, planned[challenge.game]));
    }
  });

  it('el objetivo es determinista y los parciales sólo salen en los difíciles', () => {
    for (const game of GAME_IDS) {
      const easy = objectiveFor('2026-09-09', game, 'easy', 50);
      expect(easy).toStrictEqual(objectiveFor('2026-09-09', game, 'easy', 50));
      expect(easy.kind).not.toBe('foundations');
    }
  });
});

describe('rachas', () => {
  it('días 1..7 consecutivos → racha 7', () => {
    let streak = emptyStreak();
    for (let day = 1; day <= 7; day++) {
      streak = recordPlay(streak, `2026-07-${String(day).padStart(2, '0')}`);
    }
    expect(streak.current).toBe(7);
    expect(streak.best).toBe(7);
  });

  it('saltarse un día con salvavidas disponible mantiene la racha', () => {
    let streak = emptyStreak();
    for (let day = 1; day <= 7; day++) {
      streak = recordPlay(streak, `2026-07-${String(day).padStart(2, '0')}`);
    }
    // Se salta el día 8 y vuelve el 9: el salvavidas del mes lo cubre, gratis y sin pedirlo.
    streak = recordPlay(streak, '2026-07-09');
    expect(streak.current).toBe(8);
    expect(streak.lifelineJustUsed).toBe(true);
    expect(streak.lifelineUsedMonth).toBe('2026-07');
  });

  it('saltarse dos días rompe la racha, pero bestStreak se conserva', () => {
    let streak = emptyStreak();
    for (let day = 1; day <= 8; day++) {
      streak = recordPlay(streak, `2026-07-${String(day).padStart(2, '0')}`);
    }
    expect(streak.current).toBe(8);
    streak = recordPlay(streak, '2026-07-11'); // se saltó el 9 y el 10
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(8);
  });

  it('el salvavidas es uno al mes', () => {
    let streak = emptyStreak();
    streak = recordPlay(streak, '2026-07-01');
    streak = recordPlay(streak, '2026-07-03'); // salvavidas de julio
    expect(streak.current).toBe(2);
    streak = recordPlay(streak, '2026-07-05'); // ya gastado → se rompe
    expect(streak.current).toBe(1);
  });

  it('jugar dos veces el mismo día no incrementa la racha', () => {
    let streak = recordPlay(emptyStreak(), '2026-07-12');
    streak = recordPlay(streak, '2026-07-12');
    expect(streak.current).toBe(1);
  });

  it('si el reloj retrocede, no se castiga ni se premia', () => {
    let streak = recordPlay(emptyStreak(), '2026-07-12');
    streak = recordPlay(streak, '2026-07-10');
    expect(streak.current).toBe(1);
    expect(streak.lastDay).toBe('2026-07-12');
  });

  it('el bonus de racha tiene tope', () => {
    expect(streakBonus(1)).toBe(5);
    expect(streakBonus(10)).toBe(50);
    expect(streakBonus(1000)).toBe(50);
  });

  it('daysBetween cruza meses y años', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('recompensas (P6: nunca castigar la ausencia)', () => {
  const challenge = challengesFor('2026-07-12')[0]!;

  it('perder la racha NO reduce monedas ni insignias', () => {
    let profile: Profile = { ...emptyProfile(), coins: 500 };
    let progress: Progress = {
      ...emptyProgress(),
      badges: ['streak-7'],
      stars: ['x'],
      streak: { ...emptyProgress().streak, current: 7, best: 7, lastDay: '2026-07-01' },
    };

    // Vuelve 11 días después: la racha se rompe.
    const result = claimChallenge(profile, progress, challenge, outcome(), '2026-07-12');
    profile = result.profile;
    progress = result.progress;

    expect(progress.streak.current).toBe(1);
    expect(progress.streak.best).toBe(7); // nunca se pierde
    expect(profile.coins).toBeGreaterThanOrEqual(500); // NO se resta nada. Jamás.
    expect(progress.badges).toContain('streak-7');
    expect(progress.stars).toEqual(['x']);
  });

  it('un reto no da recompensa dos veces', () => {
    const first = claimChallenge(emptyProfile(), emptyProgress(), challenge, outcome(), '2026-07-12');
    expect(first.earned.coins).toBeGreaterThan(0);
    expect(isCompleted(first.progress, challenge.date, challenge.game)).toBe(true);

    const second = claimChallenge(first.profile, first.progress, challenge, outcome(), '2026-07-12');
    expect(second.earned.coins).toBe(0);
    expect(second.profile.coins).toBe(first.profile.coins);
  });

  it('sin cumplir el objetivo no hay recompensa', () => {
    const noUndo = { ...challenge, objective: { kind: 'noUndo' } as const };
    const cheated = claimChallenge(emptyProfile(), emptyProgress(), noUndo, outcome({ undosUsed: 3 }), '2026-07-12');
    expect(cheated.earned.coins).toBe(0);
  });

  it('completar los cinco retos del día da el bonus', () => {
    let profile = emptyProfile();
    let progress = emptyProgress();
    for (const challenge of challengesFor('2026-07-12')) {
      const result = claimChallenge(profile, progress, challenge, outcome({ game: challenge.game, foundations: 8, score: 10_000 }), '2026-07-12');
      profile = result.profile;
      progress = result.progress;
      if (progress.completedChallenges.length === 5) {
        expect(result.earned.allFiveBonus).toBe(ALL_FIVE_BONUS);
      }
    }
    expect(progress.completedChallenges).toHaveLength(5);
  });

  it('recuperar un día pasado no cuenta para la racha', () => {
    const old = challengesFor('2026-07-05')[0]!;
    const result = claimChallenge(emptyProfile(), emptyProgress(), old, outcome(), '2026-07-12');
    expect(result.earned.coins).toBeGreaterThan(0); // sí da recompensa
    expect(result.progress.streak.current).toBe(0); // pero NO racha
  });

  it('la partida libre tiene tope diario para que el grindeo no tenga sentido', () => {
    let profile = emptyProfile();
    let progress = emptyProgress();
    for (let i = 0; i < 20; i++) {
      const result = claimFreePlay(profile, progress, outcome(), '2026-07-12');
      profile = result.profile;
      progress = result.progress;
    }
    expect(profile.coins).toBe(FREE_PLAY_DAILY_CAP);
  });

  it('el nivel crece suave y no desbloquea nada', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(50)).toBe(2);
    expect(levelFor(20_000)).toBeGreaterThan(levelFor(200));
  });
});

describe('cruzar la medianoche', () => {
  it('el reto se atribuye al día en que EMPEZÓ, no a aquel en que se terminó', () => {
    const clock = fixedClock('2026-07-12');
    const challenge = challengesFor(clock.today())[0]!;

    // Empieza el 12 y termina el 13 (el reloj avanza a medianoche a mitad de partida).
    clock.set('2026-07-13');
    const result = claimChallenge(emptyProfile(), emptyProgress(), challenge, outcome(), clock.today());

    expect(isCompleted(result.progress, '2026-07-12', challenge.game)).toBe(true);
    expect(isCompleted(result.progress, '2026-07-13', challenge.game)).toBe(false);
    // Y no cuenta para la racha del 13, porque el reto era del 12: no se regalan días.
    expect(result.progress.streak.current).toBe(0);
  });
});

describe('estadísticas', () => {
  it('se fusionan por máximo: nunca se le borra a nadie su mejor tiempo', () => {
    const a = record(emptyStats(), outcome({ seconds: 200, moves: 90 }));
    const b = record(emptyStats(), outcome({ seconds: 500, moves: 60 }));
    const merged = merge(a, b);
    const summary = summaryFor(merged, 'klondike');
    expect(summary.bestTime).toBe(200);
    expect(summary.fewestMoves).toBe(60);
  });

  it('la derrota rompe la racha de victorias pero conserva la mejor', () => {
    let stats = emptyStats();
    stats = record(stats, outcome());
    stats = record(stats, outcome());
    stats = record(stats, outcome({ won: false }));
    const summary = summaryFor(stats, 'klondike');
    expect(summary.bestWinStreak).toBe(2);
    expect(summary.currentWinStreak).toBe(0);
    expect(summary.played).toBe(3);
  });
});

describe('Club de Estrellas', () => {
  it('progresa jugando cualquier partida y no retrocede nunca', () => {
    const win = outcome({ game: 'klondike', undosUsed: 0, seconds: 100 });
    const first = advance({}, win);
    expect(first.completed.map((objective) => objective.id)).toContain('klondike.noUndo');

    // Volver a cumplirlo no lo cuenta dos veces ni da monedas de nuevo.
    const second = advance(first.progress, win);
    expect(second.completed.map((objective) => objective.id)).not.toContain('klondike.noUndo');
  });

  it('los objetivos de repetición cuentan las veces', () => {
    const draw3 = outcome({ variant: { game: 'klondike', draw: 3, maxRedeals: null, scoring: true } });
    let progress = advance({}, draw3).progress;
    progress = advance(progress, draw3).progress;
    const third = advance(progress, draw3);
    expect(third.completed.map((objective) => objective.id)).toContain('klondike.draw3.wins');
  });
});

describe('objetivos', () => {
  it('un objetivo parcial se cumple sin ganar la partida', () => {
    const partial = { kind: 'foundations', count: 2 } as const;
    expect(meetsObjective(partial, outcome({ won: false, foundations: 3 }))).toBe(true);
    expect(meetsObjective({ kind: 'win' }, outcome({ won: false }))).toBe(false);
  });

  it('noUndo exige ganar Y no haber deshecho', () => {
    expect(meetsObjective({ kind: 'noUndo' }, outcome({ undosUsed: 0 }))).toBe(true);
    expect(meetsObjective({ kind: 'noUndo' }, outcome({ undosUsed: 1 }))).toBe(false);
  });
});

describe('tiempo jugado hoy (informar, nunca limitar)', () => {
  it('acumula los minutos del día', () => {
    let progress = emptyProgress();
    expect(minutesPlayedToday(progress, '2026-07-12')).toBe(0);

    progress = addPlayTime(progress, '2026-07-12', 600); // 10 min
    progress = addPlayTime(progress, '2026-07-12', 330); // 5,5 min
    expect(minutesPlayedToday(progress, '2026-07-12')).toBe(15);
  });

  it('el contador arranca de cero cada día, sin arrastrar el de ayer', () => {
    let progress = addPlayTime(emptyProgress(), '2026-07-12', 3600);
    expect(minutesPlayedToday(progress, '2026-07-12')).toBe(60);

    // Al día siguiente: cero. Ni se acumula ni se "debe" nada.
    expect(minutesPlayedToday(progress, '2026-07-13')).toBe(0);
    progress = addPlayTime(progress, '2026-07-13', 120);
    expect(minutesPlayedToday(progress, '2026-07-13')).toBe(2);
  });

  it('pasarse del aviso NO tiene ninguna consecuencia', () => {
    // La prueba de que esto informa en vez de castigar: jugar de más no toca ni una moneda, ni
    // una insignia, ni la racha, ni bloquea nada. Si algún día alguien "mejora" esto añadiendo
    // una penalización, esta prueba se lo impide.
    const before = { ...emptyProfile(), coins: 300 };
    const heavy = addPlayTime({ ...emptyProgress(), badges: ['streak-7'] }, '2026-07-12', 6 * 3600);

    expect(minutesPlayedToday(heavy, '2026-07-12')).toBe(360);
    expect(before.coins).toBe(300);
    expect(heavy.badges).toEqual(['streak-7']);
    expect(heavy.streak.current).toBe(0);

    // Y se puede seguir reclamando un reto exactamente igual: nada se cierra por haber jugado.
    const challenge = challengesFor('2026-07-12')[0]!;
    const result = claimChallenge(before, heavy, challenge, outcome(), '2026-07-12');
    expect(result.earned.coins).toBeGreaterThan(0);
  });
});
