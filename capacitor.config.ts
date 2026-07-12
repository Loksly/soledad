import type { CapacitorConfig } from '@capacitor/cli';

/**
 * `server` NUNCA apunta a un servidor externo. La app se sirve entera desde el propio APK
 * (docs/08 §1). Ni el appId ni el nombre evocan a ningún producto comercial existente: los
 * nombres de los cinco juegos (Klondike, Spider, FreeCell…) son de dominio público, pero una
 * marca registrada no lo es (docs/08 §5).
 */
const config: CapacitorConfig = {
  appId: 'org.soledad.solitaire',
  appName: 'Soledad',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
