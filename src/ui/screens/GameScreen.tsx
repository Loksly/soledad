import { useEffect, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import * as game from '../../app/session';
import * as store from '../../app/store';
import { t, formatDuration, type MessageKey } from '../../services/i18n';
import { describeObjective, meetsObjective } from '../../meta/outcome';
import { feedback } from '../../services/feedback';
import { WinOverlay } from './WinOverlay';

/**
 * El tablero, más una barra mínima. Los controles van ABAJO en vertical: es donde llega el
 * pulgar de quien juega en el metro (docs/05 §3.5). La opción "zurdo" los espeja.
 */

export interface GameScreenProps {
  readonly onExit: () => void;
  readonly onAgain: () => void;
}

export function GameScreen({ onExit, onAgain }: GameScreenProps): preact.JSX.Element | null {
  const [paused, setPaused] = useState(false);
  const [earned, setEarned] = useState<store.Earned | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warned, setWarned] = useState(false);

  const settings = store.settings.value;
  const session = game.session.value;
  const challenge = game.challenge.value;
  const won = game.isWon.value;

  // Aviso del reto sin deshacer, ANTES del primer movimiento.
  useEffect(() => {
    if (warned || challenge?.objective.kind !== 'noUndo') return;
    setMessage(t('objective.noUndo'));
    setWarned(true);
  }, [challenge, warned]);

  // Autoguardado en cada movimiento (con debounce dentro del store).
  useEffect(() => {
    if (!session || won) return;
    store.saveSession(session, game.seconds.value, challenge?.date ?? null);
    store.recordPlayTime(game.drainPlayedSeconds());
  }, [session, challenge, won]);

  // Al ganar: recompensas una sola vez, y guardado inmediato.
  useEffect(() => {
    if (!won || earned) return;
    const outcome = game.currentOutcome();
    if (!outcome) return;

    feedback.win();
    store.recordPlayTime(game.drainPlayedSeconds());
    const result = store.finishGame(outcome, challenge);
    if (session) store.dropSession(store.gameKey(session, challenge?.date ?? null));
    setEarned(result);

    if (challenge && !meetsObjective(challenge.objective, outcome)) {
      setMessage(t('win.objectiveFailed'));
    }
  }, [won, earned, challenge, session]);

  // Autocompletado: nunca se dispara solo. El jugador pulsa "Terminar".
  useEffect(() => {
    if (!finishing) return;
    const step = setInterval(() => {
      if (!game.autoFinishStep()) {
        setFinishing(false);
        clearInterval(step);
      }
    }, settings.animations ? 60 : 0);
    return () => clearInterval(step);
  }, [finishing, settings.animations]);

  // Botón atrás de Android: abre el menú de pausa. NUNCA cierra la app perdiendo la partida.
  useEffect(() => {
    const onBack = (event: PopStateEvent): void => {
      event.preventDefault();
      setPaused(true);
      history.pushState(null, '');
    };
    history.pushState(null, '');
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);

  if (!session) return null;

  const objective = challenge ? describeObjective(challenge.objective) : null;
  const stuck = game.isStuck.value;

  /**
   * El reto `noUndo` DESACTIVA deshacer y lo avisa antes de empezar (docs/06 §2). Comprobarlo
   * sólo al final sería una trampa al jugador: le dejaría deshacer 40 veces y luego le diría
   * que no cuenta. Es la única situación en toda la app donde deshacer no está disponible, y es
   * porque el propio reto lo pide.
   */
  const undoLocked = challenge?.objective.kind === 'noUndo';

  const askHint = (): void => {
    const move = game.requestHint();
    if (!move) setMessage(t('board.noHint'));
    else feedback.tap();
  };

  return (
    <div class={`screen game hand-${settings.leftHanded ? 'left' : 'right'}`}>
      <header class="game-bar">
        <button class="icon" onClick={() => setPaused(true)} aria-label={t('board.menu')}>
          ☰
        </button>
        <div class="game-meta">
          <span>{t(`game.${session.game}` as MessageKey)}</span>
          {objective && (
            <span class="objective">{t(objective.key as MessageKey, { n: objective.value })}</span>
          )}
        </div>
        <div class="game-stats">
          {settings.showTimer && <span>{formatDuration(game.seconds.value)}</span>}
          <span>{game.moves.value} ✥</span>
          {game.stockLeft.value > 0 && session.game === 'spider' && (
            <span>{t('board.dealsLeft', { n: Math.ceil(game.stockLeft.value / 10) })}</span>
          )}
        </div>
      </header>

      <Board deck={{ folder: settings.deck, back: settings.back }} animations={settings.animations} />

      {stuck && !won && <div class="toast toast-stuck">{t('board.stuck')}</div>}
      {message && (
        <div class="toast" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}

      <footer class="controls">
        <button
          onClick={game.undoMove}
          disabled={undoLocked || !game.undoAvailable.value}
          title={undoLocked ? t('objective.noUndo') : undefined}
        >
          ↶ {t('board.undo')}
        </button>
        <button onClick={askHint}>💡 {t('board.hint')}</button>
        {game.canFinish.value && !won && (
          <button class="primary" onClick={() => setFinishing(true)}>
            {t('board.finish')}
          </button>
        )}
        <button onClick={game.redoMove} disabled={undoLocked || !game.redoAvailable.value}>
          ↷ {t('board.redo')}
        </button>
      </footer>

      {paused && (
        <div class="overlay" role="dialog">
          <div class="dialog">
            <h2>{t('board.paused')}</h2>
            <button class="primary" onClick={() => setPaused(false)}>
              {t('board.resume')}
            </button>
            <button
              onClick={() => {
                game.restartGame();
                setPaused(false);
              }}
            >
              {t('board.restart')}
            </button>
            <button onClick={onExit}>{t('board.quit')}</button>
          </div>
        </div>
      )}

      {won && earned && (
        <WinOverlay
          earned={earned}
          challenge={challenge}
          seconds={game.seconds.value}
          moves={game.moves.value}
          onAgain={onAgain}
          onHome={onExit}
        />
      )}
    </div>
  );
}
