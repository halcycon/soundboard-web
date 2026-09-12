#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/sounds"

if [ ! -f "$DATA_DIR/catalog.json" ] && [ -d /app/seed ]; then
  echo "Seeding sample sounds into $DATA_DIR"
  cp -a /app/seed/sounds/. "$DATA_DIR/sounds/" 2>/dev/null || true
  cp /app/seed/catalog.json "$DATA_DIR/catalog.json"
fi

exec node server/src/index.js
