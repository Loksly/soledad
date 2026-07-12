import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * UNA notificación local al día, sin servidor, **desactivada por defecto** (docs/06 §1).
 *
 * El texto es neutro a propósito: "Ya están los retos de hoy". Jamás lenguaje de culpa, jamás
 * "¡tu racha está en peligro!". El bucle diario existe para dar una razón agradable de volver,
 * no para extraer sesiones de nadie.
 *
 * `POST_NOTIFICATIONS` se pide EN ESTE MOMENTO, cuando el usuario activa el recordatorio, no al
 * arrancar la app (docs/08 §2). Si lo deniega, no pasa nada: se sigue jugando igual.
 */

const ID = 1;
const HOUR = 10; // Por la mañana, sin cuenta atrás ni urgencia.

const available = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');

export async function enableReminder(title: string, body: string): Promise<boolean> {
  if (!available()) return false;

  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return false;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: ID,
        title,
        body,
        schedule: { on: { hour: HOUR, minute: 0 }, allowWhileIdle: false },
      },
    ],
  });
  return true;
}

export async function disableReminder(): Promise<void> {
  if (!available()) return;
  await LocalNotifications.cancel({ notifications: [{ id: ID }] });
}

/** Un fallo aquí no puede impedir jugar: se traga y se sigue. */
export function syncReminder(enabled: boolean, title: string, body: string): void {
  const action = enabled ? enableReminder(title, body) : disableReminder();
  void Promise.resolve(action).catch(() => undefined);
}
