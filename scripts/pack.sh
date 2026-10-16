#!/bin/sh
# Pack src/ into dist/openrouter-<version>.bobplugin and print its sha256.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(node -p "require('$ROOT/src/info.json').version")
OUT="$ROOT/dist/openrouter-$VERSION.bobplugin"

mkdir -p "$ROOT/dist"
rm -f "$OUT"
(cd "$ROOT/src" && zip -qr -X "$OUT" . -x '.*')

echo "$OUT"
shasum -a 256 "$OUT" | cut -d' ' -f1
