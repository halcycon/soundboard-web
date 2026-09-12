#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/data}"
SEED_DIR="${SEED_DIR:-/app/seed}"
mkdir -p "$DATA_DIR/sounds"

seed_if_needed() {
  if [ ! -d "$SEED_DIR" ] || [ ! -f "$SEED_DIR/catalog.json" ]; then
    return 0
  fi

  if [ ! -f "$DATA_DIR/catalog.json" ]; then
    echo "Seeding sample catalog into $DATA_DIR"
    cp -a "$SEED_DIR/sounds/." "$DATA_DIR/sounds/"
    cp "$SEED_DIR/catalog.json" "$DATA_DIR/catalog.json"
    return 0
  fi

  # Repair: catalog present but audio files missing (common with half-initialized volumes)
  missing=0
  for f in "$SEED_DIR/sounds"/*; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    if [ ! -f "$DATA_DIR/sounds/$base" ]; then
      cp "$f" "$DATA_DIR/sounds/$base"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    echo "Restored missing seed sound files into $DATA_DIR/sounds"
  fi
}

seed_if_needed

exec node server/src/index.js
