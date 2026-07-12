import { useEffect, useState } from 'preact/hooks';
import { App as CapacitorApp } from '@capacitor/app';
import type { GameId, Variant } from '../core/types';
import { randomSeed } from '../core/rng';
import type { Session } from '../core/history';
import type { SavedGame } from '../services/storage/schema';
import type { DailyChallenge } from '../meta/daily';
import * as game from './session';
import * as store from './store';
import { Home } from '../ui/screens/Home';
import { GameScreen } from '../ui/screens/GameScreen';
import { Daily } from '../ui/screens/Daily';
import { Stats } from '../ui/screens/Stats';
import { Stars } from '../ui/screens/Stars';
import { Shop } from '../ui/screens/Shop';
import { Settings } from '../ui/screens/Settings';
import { NewGame } from '../ui/screens/NewGame';
import { preloadDeck } from '../ui/board/cardSrc';
import { loadManifest, manifest } from './dailies';
import { challengesFor } from '../meta/daily';
import { t } from '../services/i18n';
import { systemClock } from '../services/clock';

type Screen = 'home' | 'game' | 'daily' | 'stats' | 'stars' | 'shop' | 'settings';

export function App(): preact.JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState<GameId | null>(null);
  const today = systemClock.today();

  useEffect(() => {
    const boot = async (): Promise<void> => {
      await store.hydrate();
      // Precarga de las 54 imágenes antes de enseñar nada: un mazo que aparece por trozos es
      // inaceptable (docs/05 §1). Sin splash artificial: dura lo que dura la carga real.
      // El manifiesto va en paralelo: son 150 kB de JSON que no deben retrasar las cartas.
      await Promise.all([
        preloadDeck({ folder: store.settings.value.deck, back: store.settings.value.back }),
        loadManifest(),
      ]);
      setReady(true);
    };
    void boot();
  }, []);

  /**
   * Android mata el proceso en segundo plano sin avisar. Aquí se guarda YA, sin debounce: si se
   * pierde una partida a medias, el usuario desinstala y tiene razón (docs/08 §7).
   */
  useEffect(() => {
    const saveNow = (): void => {
      const session = game.session.value;
      if (session && !game.isWon.value) {
        store.saveSession(session, game.seconds.value, game.challenge.value?.date ?? null);
        store.recordPlayTime(game.drainPlayedSeconds());
      }
      void store.flush();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // `pagehide` además de `visibilitychange`: al RECARGAR o navegar fuera, el cambio de
    // visibilidad no siempre llega, y ahí se perdía la partida. Los dos son baratos.
    window.addEventListener('pagehide', saveNow);
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) saveNow();
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveNow);
      void listener.then((handle) => handle.remove());
    };
  }, []);

  const playChallenge = (challenge: DailyChallenge): void => {
    const saved = store.savedGames.value.find(
      (entry) => entry.challengeDate === challenge.date && entry.game === challenge.game,
    );
    if (saved) {
      game.resume(toSession(saved), challenge, saved.seconds);
    } else {
      game.start(challenge.game, challenge.variant, challenge.seed, challenge);
    }
    setScreen('game');
  };

  /**
   * Tocar un juego CONTINÚA la partida que tenías a medias. Repartir de cero es una acción
   * aparte, que hay que pedir. Al revés — repartir siempre y esconder lo anterior en una lista —
   * es exactamente lo que hacía que jugar te borrase la partida en curso.
   */
  const openGame = (id: GameId): void => {
    const saved = store.savedFor(id);
    if (saved) {
      game.resume(toSession(saved), null, saved.seconds);
      setScreen('game');
      return;
    }
    setPicking(id);
  };

  const playFree = (id: GameId, variant: Variant, seed: number): void => {
    // Repartir de cero pisa el hueco de ese juego: sólo hay una partida libre en curso por
    // tipo, y el jugador acaba de decir explícitamente que quiere empezar otra.
    game.start(id, variant, seed, null);
    setPicking(null);
    setScreen('game');
  };

  const resume = (id: string): void => {
    const saved = store.savedGames.value.find((entry) => entry.id === id);
    if (!saved) return;

    // Si era un reto diario, se retoma COMO reto: si no, se perdería su objetivo y su recompensa.
    const challenge = saved.challengeDate
      ? (challengesFor(saved.challengeDate, manifest()).find((c) => c.game === saved.game) ?? null)
      : null;

    game.resume(toSession(saved), challenge, saved.seconds);
    setScreen('game');
  };

  const exit = (): void => {
    const session = game.session.value;
    if (session && !game.isWon.value) {
      store.saveSession(session, game.seconds.value, game.challenge.value?.date ?? null);
      store.recordPlayTime(game.drainPlayedSeconds());
      // Volcado inmediato, sin esperar al debounce: si el usuario cierra la app justo después
      // de salir al inicio, los 400 ms de espera serían justo lo que le borra la partida.
      void store.flush();
    }
    game.clear();
    setScreen('home');
  };

  const again = (): void => {
    const session = game.session.value;
    if (!session) return exit();
    const challenge = game.challenge.value;
    if (challenge) {
      // Un reto se puede reintentar sin límite el mismo día: el reparto es el mismo.
      game.start(challenge.game, challenge.variant, challenge.seed, challenge);
    } else {
      // Otra partida del mismo juego y la misma variante, con reparto nuevo.
      game.start(session.game, session.variant, randomSeed(), null);
    }
  };

  if (!ready) {
    return (
      <div class="screen splash">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  switch (screen) {
    case 'game':
      return <GameScreen onExit={exit} onAgain={again} />;
    case 'daily':
      return <Daily today={today} onPlay={playChallenge} onBack={() => setScreen('home')} />;
    case 'stats':
      return <Stats onBack={() => setScreen('home')} />;
    case 'stars':
      return <Stars onBack={() => setScreen('home')} />;
    case 'shop':
      return <Shop onBack={() => setScreen('home')} />;
    case 'settings':
      return <Settings onBack={() => setScreen('home')} />;
    case 'home':
      return (
        <>
          <Home
            today={today}
            onPlayChallenge={playChallenge}
            onPlayFree={openGame}
            onNewGame={setPicking}
            onResume={resume}
            onOpen={setScreen}
          />
          {picking && (
            <NewGame
              game={picking}
              onStart={(variant, seed) => playFree(picking, variant, seed)}
              onCancel={() => setPicking(null)}
            />
          )}
        </>
      );
  }
}

const toSession = (saved: SavedGame): Session => ({
  game: saved.game,
  variant: saved.variant,
  seed: saved.seed,
  moves: saved.moves,
  cursor: saved.cursor,
  undosUsed: saved.undosUsed,
  hintsUsed: saved.hintsUsed,
});
