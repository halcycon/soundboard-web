#!/usr/bin/env node
/**
 * Merge baked /app/seed catalog into DATA_DIR without clobbering user uploads.
 * Replaces prior demo rows that match seed labels in UI/FX/Stingers categories.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/data';
const SEED_DIR = process.env.SEED_DIR || '/app/seed';
const seedVersionPath = path.join(SEED_DIR, 'SEED_VERSION');
const dataVersionPath = path.join(DATA_DIR, 'SEED_VERSION');
const seedCatalogPath = path.join(SEED_DIR, 'catalog.json');
const dataCatalogPath = path.join(DATA_DIR, 'catalog.json');
const seedSounds = path.join(SEED_DIR, 'sounds');
const dataSounds = path.join(DATA_DIR, 'sounds');

if (!existsSync(seedCatalogPath) || !existsSync(seedVersionPath)) {
  process.exit(0);
}

const seedVersion = (await readFile(seedVersionPath, 'utf8')).trim();
const currentVersion = existsSync(dataVersionPath)
  ? (await readFile(dataVersionPath, 'utf8')).trim()
  : '';

await mkdir(dataSounds, { recursive: true });

const seedCatalog = JSON.parse(await readFile(seedCatalogPath, 'utf8'));
/** @type {any[]} */
let catalog = [];
if (existsSync(dataCatalogPath)) {
  catalog = JSON.parse(await readFile(dataCatalogPath, 'utf8'));
}

const demoLabels = new Set(seedCatalog.map((s) => `${s.category}::${s.text}`));
const DEMO_CATEGORIES = new Set(['UI', 'FX', 'Stingers', 'General']);

// Drop previous demo rows when seed version changes (keep uploads / other categories).
if (seedVersion !== currentVersion) {
  catalog = catalog.filter((s) => {
    const key = `${s.category}::${s.text}`;
    const isOldDemo =
      DEMO_CATEGORIES.has(s.category) &&
      (demoLabels.has(key) ||
        ['Beep', 'Boop', 'Buzz', 'Chime', 'Click', 'Pop', 'Notify', 'Rimshot', 'Whoosh', 'Laser', 'Power Up', 'Fanfare', 'Buzzer', 'Coin'].includes(
          s.text,
        ));
    return !isOldDemo;
  });
}

const existing = new Set(catalog.map((s) => `${s.category}::${s.text}`));
let added = 0;

for (const sound of seedCatalog) {
  const src = path.join(seedSounds, sound.file);
  const dest = path.join(dataSounds, sound.file);
  if (existsSync(src)) {
    await copyFile(src, dest);
  }
  const key = `${sound.category}::${sound.text}`;
  if (!existing.has(key)) {
    catalog.push(sound);
    existing.add(key);
    added += 1;
  }
}

await writeFile(dataCatalogPath, JSON.stringify(catalog, null, 2));
await writeFile(dataVersionPath, seedVersion);
console.log(
  `seed ${seedVersion}: catalog=${catalog.length} (+${added} demo), version ${currentVersion || 'none'} → ${seedVersion}`,
);
