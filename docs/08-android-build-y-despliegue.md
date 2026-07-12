# 08 — Build Android y despliegue

Objetivo: que una sola orden produzca un APK instalable, y que cualquiera pueda auditar que la
app no habla con nadie.

## 1. Configuración

```ts
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'org.soledad.solitaire',     // Nada que evoque a una marca registrada ajena
  appName: 'Soledad',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,   // sólo true en debug
  },
  server: { androidScheme: 'https' },     // NUNCA apuntar a un servidor externo
};
```

- `minSdkVersion`: **24** (Android 7, 2016). Cubre prácticamente todo el parque y evita
  WebViews prehistóricos con bugs de CSS.
- `targetSdkVersion`: el más reciente exigido por Play (revisar en cada release).
- El WebView de Android es actualizable vía Play Store, así que hay soporte moderno de CSS y JS
  incluso en dispositivos viejos. Aun así, **probar en un WebView real**, no sólo en Chrome de
  escritorio.

## 2. Permisos — la promesa verificable

`AndroidManifest.xml` de la variante base:

```xml
<!-- NINGÚN permiso. Ni siquiera INTERNET. -->
<manifest>
  <application
      android:allowBackup="true"
      android:fullBackupContent="@xml/backup_rules"
      android:usesCleartextTraffic="false">
```

- **Sin `INTERNET`**, la app es *físicamente incapaz* de mostrar un anuncio, enviar telemetría o
  filtrar datos. Es lo que convierte "confía en nosotros" en un hecho comprobable con
  `aapt dump permissions`.
- Sin `ACCESS_NETWORK_STATE`, sin `READ/WRITE_EXTERNAL_STORAGE` (el SAF no lo necesita), sin
  ubicación, sin identificadores.
- `VIBRATE` es el único permiso opcional (háptica). Es de nivel "normal" y no requiere diálogo.
- `POST_NOTIFICATIONS` **sólo** si el usuario activa el recordatorio diario, y se pide en ese
  momento, no al arrancar.

### Flavor con nube

```
android { productFlavors { base {} ; cloud { /* añade INTERNET */ } } }
```

La variante `cloud` (con `INTERNET` y el módulo `services/sync/`) se distribuye aparte y **se
anuncia como tal**. Quien quiera la garantía total instala `base`. Es una decisión de honestidad,
no técnica.

## 3. Órdenes

```bash
npm run dev            # Vite, en el navegador, ciclo rápido
npm run build          # bundle de producción a dist/
npm run sync           # cap sync android
npm run android        # abre Android Studio
npm run apk:debug      # ./gradlew assembleDebug  → APK instalable, sin firmar
npm run apk:release    # ./gradlew bundleRelease  → AAB firmado
npm run e2e:android    # Playwright contra el WebView
```

**El primer objetivo de la fase 0 es que `npm run apk:debug` produzca un APK que se instale y
arranque**, aunque muestre una pantalla vacía. Dejar el despliegue para el final es el error
clásico: el 90 % de los problemas de Capacitor (rutas de assets, esquema `https://`,
`safe-area`, botón atrás) sólo aparecen en el dispositivo.

### Rutas de assets — trampa conocida

En Capacitor la app se sirve desde `https://localhost`. Las rutas **absolutas** (`/assets/...`)
funcionan; las relativas dependen de la ruta actual. En `vite.config.ts`: `base: './'` **rompe**
las rutas de las cartas si se navega. Usar `base: '/'` y rutas absolutas, y **verificarlo en el
dispositivo en la fase 0**, no en la 5.

Las cartas se copian a `dist/assets/cards/` en el build. Si se opta por el sprite (ver
[05](05-ui-ux.md)), sólo se copia el sprite y las variantes seleccionables — **no** las cinco
carpetas completas, que multiplicarían el tamaño del APK sin motivo.

## 4. Tamaño y arranque

| Presupuesto | Límite |
|---|---|
| APK (base, un solo mazo) | < 15 MB |
| JS + CSS (gzip) | < 200 kB |
| Arranque en frío hasta poder mover una carta | < 2 s en gama media |

- Los SVG de cartas se optimizan con **SVGO** en el build (quitan metadatos de Inkscape, que
  pesan mucho en estos ficheros).
- Sólo se empaqueta el mazo por defecto (`Vertical2`) + los reversos. Las demás variantes:
  descarga bajo demanda (variante `cloud`) o se empaquetan si caben en el presupuesto — medir.
- Sin *splash screen* artificial: la pantalla de arranque dura lo que dure la precarga real.

## 5. Distribución

1. **APK directo** (GitHub Releases) — el camino principal. Sin cuenta de desarrollador, sin
   revisiones, sin políticas cambiantes.
2. **F-Droid** — el sitio natural para esta app. Requiere: licencia libre (**GPL-3.0** o MIT),
   build reproducible desde el repositorio, **sin dependencias propietarias** (por eso el flavor
   `base` no incluye Google Drive), y metadatos en `fastlane/metadata/android/`.
3. **Google Play** — opcional. Ojo: Play exige *Data safety*, y aquí se declara "no se recogen
   datos", que es literalmente cierto y verificable. Cuenta de desarrollador de pago y política
   de contenido con marcas: **el nombre y los iconos no pueden evocar a ninguna marca ajena**.
4. **PWA** — sale gratis del mismo `dist/`. Añadir `manifest.webmanifest` y un Service Worker que
   cachee todo (offline-first). Es el plan B si Play da problemas.

## 6. Firma

- Keystore **fuera del repositorio**, con `signingConfig` leído de variables de entorno o de
  `local.properties` (que va en `.gitignore`).
- Guardar el keystore y su contraseña en un gestor: perderlo significa no poder actualizar
  nunca más la app en Play para los usuarios existentes.
- El build de release debe ser **reproducible**: sin marcas de tiempo, sin rutas absolutas en el
  bundle.

## 7. Ciclo de vida Android que hay que manejar

Esto es lo que rompe una app web empaquetada, y hay que probarlo en dispositivo:

- **`appStateChange` (background)** → guardar la partida **ya** ([07](07-persistencia-y-sync.md) §2).
- **Proceso matado en segundo plano** → al reabrir, restaurar la partida exacta.
- **Botón atrás** → menú de pausa en partida; navegación normal fuera; nunca cerrar perdiendo estado.
- **Rotación** → recalcular el layout, sin perder la partida ni el arrastre en curso.
- **Multiventana / pantalla dividida** → el layout responsive debe aguantarlo.
- **Insets / notch / barra de gestos** → `env(safe-area-inset-*)`, edge-to-edge.
- **Modo ahorro de batería** → las animaciones pueden reducirse; el juego sigue.
- **Interrupción por llamada** → pausa, guardado, sin perder nada.
