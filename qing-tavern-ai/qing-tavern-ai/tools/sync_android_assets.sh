#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/android/app/src/main/assets"
mkdir -p "$ASSETS"
cp "$ROOT/web/index.html" "$ASSETS/index.html"
cp "$ROOT/web/styles.css" "$ASSETS/styles.css"
cp "$ROOT/web/app.js" "$ASSETS/app.js"
cp "$ROOT/web/manifest.webmanifest" "$ASSETS/manifest.webmanifest"
cp "$ROOT/web/icon.svg" "$ASSETS/icon.svg"
cp "$ROOT/web/sw.js" "$ASSETS/sw.js"
echo "Synced web assets into Android assets."
