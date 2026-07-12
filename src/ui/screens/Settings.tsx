import { useRef, useState } from 'preact/hooks';
import * as store from '../../app/store';
import { parseImport } from '../../services/storage/schema';
import { t } from '../../services/i18n';
import { systemClock } from '../../services/clock';

/**
 * Exportar/importar es la garantía REAL de que el progreso pertenece al usuario (P5), y funciona
 * sin nube: el fichero se guarda con el selector de Android y el usuario elige su Drive, su
 * Dropbox o su tarjeta SD, con la app que ya tiene. Nosotros no necesitamos permisos de red ni
 * credenciales de nadie (docs/07 §3).
 */

export interface SettingsProps {
  readonly onBack: () => void;
}

export function Settings({ onBack }: SettingsProps): preact.JSX.Element {
  const settings = store.settings.value;
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ summary: string; apply: () => void } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportData = (): void => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // La fecha entra por el reloj inyectable, hasta para el nombre de un fichero.
    link.download = `soledad-${systemClock.today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File): Promise<void> => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setMessage(t('import.error.corrupt'));
      return;
    }

    // Nunca se confía en un fichero externo: se valida con Zod antes de tocarlo (docs/09 §1).
    const report = parseImport(raw);
    if (!report.ok || !report.data || !report.summary) {
      setMessage(t(report.error === undefined ? 'import.error.corrupt' : report.error as 'import.error.corrupt'));
      return;
    }

    // Se pide confirmación EXPLÍCITA antes de sobrescribir. Nunca en silencio.
    const data = report.data;
    setPending({
      summary: t('import.confirm', {
        days: report.summary.days,
        badges: report.summary.badges,
      }),
      apply: () => {
        void store.replaceAll(data).then(() => {
          setPending(null);
          setMessage(t('import.done'));
        });
      },
    });
  };

  return (
    <div class="screen list">
      <header class="list-head">
        <button class="icon" onClick={onBack} aria-label={t('common.back')}>
          ←
        </button>
        <h1>{t('settings.title')}</h1>
      </header>

      <section class="card-panel">
        <label class="row">
          <span>{t('settings.theme')}</span>
          <select
            value={settings.theme}
            onChange={(event) =>
              store.updateSettings({ theme: (event.target as HTMLSelectElement).value as 'system' })
            }
          >
            <option value="system">{t('settings.theme.system')}</option>
            <option value="light">{t('settings.theme.light')}</option>
            <option value="dark">{t('settings.theme.dark')}</option>
          </select>
        </label>

        <label class="row">
          <span>{t('settings.language')}</span>
          <select
            value={settings.language}
            onChange={(event) =>
              store.updateSettings({
                language: (event.target as HTMLSelectElement).value as 'system',
              })
            }
          >
            <option value="system">{t('settings.language.system')}</option>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>

        <Toggle
          label={t('settings.sound')}
          checked={settings.sound}
          onChange={(sound) => store.updateSettings({ sound })}
        />
        <Toggle
          label={t('settings.haptics')}
          checked={settings.haptics}
          onChange={(haptics) => store.updateSettings({ haptics })}
        />
        <Toggle
          label={t('settings.animations')}
          checked={settings.animations}
          onChange={(animations) => store.updateSettings({ animations })}
        />
        <Toggle
          label={t('settings.leftHanded')}
          checked={settings.leftHanded}
          onChange={(leftHanded) => store.updateSettings({ leftHanded })}
        />
        <Toggle
          label={t('settings.showTimer')}
          checked={settings.showTimer}
          onChange={(showTimer) => store.updateSettings({ showTimer })}
        />
        <label class="row">
          <span>
            {t('settings.dailyGoal')}
            <small class="muted">{t('settings.dailyGoalHint')}</small>
          </span>
          <select
            value={String(settings.dailyGoalMinutes)}
            onChange={(event) =>
              store.updateSettings({
                dailyGoalMinutes: Number((event.target as HTMLSelectElement).value),
              })
            }
          >
            <option value="0">{t('settings.dailyGoalOff')}</option>
            {[10, 15, 20, 30, 45, 60, 90].map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {t('settings.minutes', { n: minutes })}
              </option>
            ))}
          </select>
        </label>

        <Toggle
          label={t('settings.dailyReminder')}
          checked={settings.dailyReminder}
          onChange={(dailyReminder) => store.updateSettings({ dailyReminder })}
          hint={t('settings.dailyReminderHint')}
        />
        <p class="muted hint">{t('settings.accessibleDeck')}</p>
      </section>

      <section class="card-panel">
        <h2>{t('settings.export')}</h2>
        <p class="muted hint">{t('settings.exportHint')}</p>
        <div class="row-actions">
          <button onClick={exportData}>{t('settings.export')}</button>
          <button onClick={() => fileInput.current?.click()}>{t('settings.import')}</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) void importData(file);
          }}
        />
      </section>

      <section class="card-panel">
        <h2>{t('settings.privacy')}</h2>
        <p class="muted">{t('settings.privacyText')}</p>
      </section>

      {/*
        La atribución de las cartas va DENTRO de la app, no sólo en el repositorio. Son de dominio
        público y no la exigen; se da igual, porque quien hizo ese trabajo merece que se le nombre
        y porque el usuario tiene derecho a saber de dónde sale lo que está mirando.
      */}
      <section class="card-panel">
        <h2>{t('credits.title')}</h2>
        <p class="muted">{t('credits.cards')}</p>
        <p class="muted">{t('credits.games')}</p>
        <p class="muted">{t('credits.license')}</p>
      </section>

      {message && (
        <div class="toast" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}

      {pending && (
        <div class="overlay" role="dialog">
          <div class="dialog">
            <p>{pending.summary}</p>
            <button class="primary" onClick={pending.apply}>
              {t('common.confirm')}
            </button>
            <button onClick={() => setPending(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}): preact.JSX.Element {
  return (
    <label class="row">
      <span>
        {label}
        {hint && <small class="muted">{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
      />
    </label>
  );
}
