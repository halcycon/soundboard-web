#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/data}"
SEED_DIR="${SEED_DIR:-/app/seed}"
mkdir -p "$DATA_DIR/sounds"

if [ -d "$SEED_DIR" ] && [ -f "$SEED_DIR/catalog.json" ]; then
  DATA_DIR="$DATA_DIR" SEED_DIR="$SEED_DIR" node /app/scripts/merge-seed.mjs
fi

exec node server/src/index.js
