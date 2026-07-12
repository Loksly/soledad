import { z } from 'zod';
import type { DailyManifest } from '../meta/daily';
import { asset } from '../services/base';

/**
 * El manifiesto de repartos verificados, generado en CI y versionado (docs/04 §5).
 *
 * NO se importa como módulo. Se probó, y a un año de retos ya engordaba el bundle de JS en
 * 20 kB comprimidos; el horizonte que pide docs/04 es de DIEZ años, que son ~1,5 MB de JSON y
 * se cargarían de un plumazo el presupuesto de 200 kB (docs/09 §4). Se sirve como un asset
 * estático aparte, que el navegador cachea y que no bloquea el arranque del motor.
 *
 * `fetch` sobre una ruta local NO necesita el permiso INTERNET: en Capacitor lo resuelve el
 * WebViewAssetLoader, igual que carga la propia app. La promesa sigue intacta.
 *
 * El móvil sólo LEE la semilla: coste cero, batería cero, misma partida en todos los
 * dispositivos, sin servidor. El solver no se ejecuta jamás aquí.
 */

const entry = z.object({
  seed: z.number().int(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'expert']),
  verified: z.boolean(),
  minMoves: z.number().int().min(0),
});

const schema = z.object({
  version: z.number().int(),
  from: z.string(),
  to: z.string(),
  deals: z.record(
    z.string(),
    z.record(z.enum(['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks']), entry),
  ),
});

const MANIFEST_URL = asset('assets/daily/manifest.json');

let loaded: DailyManifest | undefined;

export const manifest = (): DailyManifest | undefined => loaded;

/**
 * Si el manifiesto falla al cargar (fichero corrupto, borrado, lo que sea), la app NO se rompe:
 * `challengesFor` deriva las semillas de la fecha y marca los retos como no verificados. Un
 * jugador sin retos es un fallo; un jugador con retos sin sello de verificación, no.
 */
export async function loadManifest(): Promise<void> {
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) return;
    const parsed = schema.safeParse(await response.json());
    if (parsed.success) loaded = parsed.data;
  } catch {
    // Sin manifiesto se juega igual. Nunca se bloquea el arranque por esto.
  }
}

export const coversDate = (date: string): boolean => loaded?.deals[date] !== undefined;
