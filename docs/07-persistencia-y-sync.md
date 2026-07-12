# 07 — Persistencia y sincronización opcional

## 1. Qué se guarda

| Colección | Contenido | Almacén |
|---|---|---|
| `settings` | Tema, mazo, idioma, sonido, háptica, zurdo/diestro, animaciones | `@capacitor/preferences` (clave-valor, pequeño, rápido en el arranque) |
| `profile` | XP, nivel, monedas, cosméticos desbloqueados y equipados | IndexedDB |
| `progress` | Retos completados por fecha, racha, `bestStreak`, insignias, estrellas | IndexedDB |
| `stats` | Por juego y variante: jugadas, ganadas, mejor tiempo, menos movimientos | IndexedDB |
| `savedGames` | Partidas en curso: `(game, variant, seed, moves[], cursor)` | IndexedDB |
| `history` | Últimas N partidas terminadas (para "repetir esa que casi gano") | IndexedDB, con tope (500) |

**Lo que NO se guarda: nada que identifique a la persona.** Sin ID de dispositivo, sin
publicidad, sin correo, sin IP, sin nada.

## 2. Reglas de almacenamiento

- **Todo dato persistido lleva `schemaVersion`.** Al arrancar, se ejecutan las migraciones
  pendientes en orden. Una migración es una función `(vN) => vN+1`, pura y probada.
- **Nunca se borra dato del usuario en una migración.** Si un campo deja de usarse, se ignora,
  no se elimina. El coste de guardar basura es cero; el de borrar el progreso de alguien, infinito.
- **Escrituras atómicas**: una transacción de IndexedDB por operación. Si la app muere a mitad,
  o está el estado viejo o el nuevo, nunca uno a medias.
- **Autoguardado** de la partida en curso: **al hacer cada movimiento**, con *debounce* de 400 ms,
  y **siempre e inmediatamente** en los eventos `pause`/`appStateChange` de Capacitor y en
  `visibilitychange`. Android puede matar el proceso sin avisar: si se pierde una partida a medias,
  es un defecto grave.
- Como la partida se guarda como `(seed, moves[])`, ocupa bytes y escribirla es baratísimo.
- **Interfaz, no implementación**: la app habla con `Repository`; IndexedDB está detrás. En
  tests se inyecta `InMemoryRepository`.

```ts
interface Repository {
  get<T>(key: StoreKey): Promise<T | null>;
  put<T>(key: StoreKey, value: T): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
```

## 3. Exportar / importar (esto es lo importante)

**Es la garantía real de que el progreso pertenece al usuario (P5), y funciona sin nube.**

- Botón "Exportar mis datos" → genera un JSON legible, con `schemaVersion`, y lo guarda con el
  selector de ficheros de Android (Storage Access Framework, `@capacitor/filesystem` +
  `@capacitor/share`). **Ahí el usuario puede elegir su Drive, su Dropbox o su tarjeta SD, con
  la app que ya tiene.** Nosotros no necesitamos permisos de red ni credenciales de nadie.
- Botón "Importar" → lee un JSON, valida con **Zod** (nunca se confía en un fichero externo),
  muestra un resumen ("Este fichero tiene 143 días de progreso y 12 insignias; tu progreso
  actual se sustituirá") y **pide confirmación explícita** antes de sobrescribir.
- Importar **nunca** pierde datos silenciosamente: si el fichero es de una versión antigua, se
  migra; si es más nuevo, se rechaza con un mensaje claro.

Esto cubre el 90 % de la necesidad de "nube" con el 5 % de la complejidad y **cero** riesgo de
privacidad.

## 4. Sincronización en la nube (opcional, opt-in, apagada por defecto)

Sólo para quien la quiera. Nunca es necesaria. La app **no menciona la nube** en el arranque ni
en el juego: vive escondida en Ajustes.

```ts
interface SyncProvider {
  readonly id: 'gdrive' | 'webdav' | 'file';
  isLinked(): Promise<boolean>;
  link(): Promise<void>;                       // OAuth o credenciales, en un WebView del sistema
  unlink(): Promise<void>;
  pull(): Promise<SyncBlob | null>;
  push(blob: SyncBlob): Promise<void>;
}

interface SyncBlob { schemaVersion: number; updatedAt: number; device: string; data: AppData; }
```

**Implementación recomendada por orden:**

1. **`file`** (MVP, ya cubierto por §3): exportar/importar manual. Cero red, cero permisos.
2. **`gdrive`**: Google Drive **`appDataFolder`** — carpeta oculta y privada de la app, que el
   usuario no ve y a la que ninguna otra app accede. Gratis, ya tiene cuenta, y no exponemos
   nada al resto de su Drive. Requiere `INTERNET` → **flavor de build separado**
   (ver [08](08-android-build-y-despliegue.md)).
3. **`webdav`**: Nextcloud y similares, para quien se autoaloja. Sencillo (PUT/GET) y sin OAuth.

**Descartado**: Supabase / Firebase / backend propio. Implicarían servidor, cuenta, términos de
servicio, RGPD y una dependencia que puede morir o empezar a cobrar. Contradicen P2 y P3.
(El borrador original mencionaba Supabase; se descarta deliberadamente.)

### Reglas de la sincronización

- **Nunca bloquea el juego.** Si falla, se juega igual y se reintenta luego. Un error de red
  jamás muestra un modal que tape el tablero: como mucho, un icono discreto.
- **Fusión, no "el último gana a lo bruto".** Al sincronizar dos dispositivos:
  - `stats`: se fusionan por **máximo** (mejor tiempo = el menor, victorias = suma sólo si se
    puede desduplicar por id de partida; si no, el máximo).
  - `progress.completedChallenges`: **unión** de conjuntos de fechas. Nunca se pierde un día hecho.
  - `profile.coins`: el **máximo** (sí, es explotable; no hay ranking, da igual, y es infinitamente
    mejor que borrarle las monedas a alguien).
  - `settings`: gana el `updatedAt` más reciente.
  - `savedGames`: gana el `updatedAt` más reciente **por partida**; en empate, la de más movimientos.
- Se sincroniza al abrir la app y al cerrarla, no continuamente. Con *backoff* exponencial ante fallos.
- El blob puede **cifrarse** con una frase de paso opcional (AES-GCM vía WebCrypto). Si el usuario
  la olvida, el blob se pierde: se avisa con claridad.
- **La app debe seguir compilando, pasando los tests y funcionando entera con `sync` eliminado
  del árbol de dependencias.** Es la prueba de que de verdad es opcional.

## 5. Copia de seguridad de Android

`android:allowBackup="true"` con `fullBackupContent` limitado a los datos del juego. Es gratis,
pasa por la copia de Google del usuario (o no, si la tiene desactivada) y no requiere código.
Pero **no sustituye** a exportar/importar: es un complemento.

## 6. Pruebas obligatorias

- Migración de cada versión de esquema a la siguiente, con datos reales de ejemplo.
- Matar el proceso (simulado) a mitad de partida y reabrir: el tablero está intacto.
- Importar un JSON corrupto, truncado, con campos de más y con `schemaVersion` futura: nunca
  crashea, nunca corrompe el estado actual.
- Fusionar dos blobs con días completados distintos: el resultado contiene la unión.
- El árbol de dependencias de la variante base **no** contiene `services/sync/` (comprobado en CI).
