#!/usr/bin/env bash
# Comprueba que el APK cumple la promesa del proyecto (docs/08 §2, docs/10 fase 0 y 6).
#
# Esto NO es una formalidad: es la única forma de que "cero publicidad, cero telemetría" sea un
# hecho comprobable en vez de algo que hay que creerse. Si este script falla, no se publica.
#
#   ./scripts/verify-apk.sh android/app/build/outputs/apk/debug/app-debug.apk

set -euo pipefail

APK="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"

if [[ ! -f "$APK" ]]; then
  echo "No existe el APK: $APK"
  echo "Constrúyelo con:  npm run apk:debug"
  exit 1
fi

AAPT="$(command -v aapt2 || command -v aapt || true)"
if [[ -z "$AAPT" ]]; then
  # aapt vive dentro del SDK; si no está en el PATH, se busca en la ubicación habitual.
  AAPT="$(find "${ANDROID_HOME:-$HOME/Android/Sdk}/build-tools" -name aapt2 2>/dev/null | sort -r | head -1 || true)"
fi
if [[ -z "$AAPT" ]]; then
  echo "No encuentro aapt/aapt2. Instala las build-tools del SDK de Android."
  exit 1
fi

echo "APK: $APK"
echo "Tamaño: $(du -h "$APK" | cut -f1)  (presupuesto: < 15 MB)"
echo

PERMS="$("$AAPT" dump permissions "$APK" | grep "uses-permission" || true)"

echo "Permisos declarados:"
if [[ -z "$PERMS" ]]; then
  echo "  (ninguno)"
else
  echo "$PERMS" | sed 's/^/  /'
fi
echo

if echo "$PERMS" | grep -q "android.permission.INTERNET"; then
  echo "FALLO: el APK pide el permiso INTERNET."
  echo "La variante base NO puede pedirlo: es lo que hace verificable la promesa de cero"
  echo "telemetría. Revisa android/app/src/main/AndroidManifest.xml y qué librería lo mete."
  exit 1
fi

ALLOWED='android.permission.VIBRATE|android.permission.POST_NOTIFICATIONS'
UNEXPECTED="$(echo "$PERMS" | grep -oP "(?<=name=')[^']+" | grep -vE "^($ALLOWED)$" || true)"
if [[ -n "$UNEXPECTED" ]]; then
  echo "FALLO: permisos inesperados:"
  echo "$UNEXPECTED" | sed 's/^/  /'
  exit 1
fi

SIZE_BYTES="$(stat -c %s "$APK")"
if (( SIZE_BYTES > 15 * 1024 * 1024 )); then
  echo "FALLO: el APK pasa de 15 MB (docs/08 §4)."
  exit 1
fi

echo "OK: sin INTERNET, sin permisos peligrosos, y por debajo de 15 MB."
