#!/usr/bin/env node
/**
 * Build the demo catalog from vendored CC0 Kenney samples
 * (see third_party/kenney/ATTRIBUTION.md).
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const SOUNDS = path.join(DATA, 'sounds');
const KENNEY = path.join(ROOT, 'third_party/kenney');
const SEED_VERSION = '4';

function newId() {
  return randomBytes(5).toString('hex');
}

const manifest = JSON.parse(await readFile(path.join(KENNEY, 'manifest.json'), 'utf8'));
await mkdir(SOUNDS, { recursive: true });

const catalog = [];
for (const entry of manifest) {
  const sid = newId();
  const file = `${sid}.mp3`;
  const src = path.join(KENNEY, entry.file);
  const dest = path.join(SOUNDS, file);
  await copyFile(src, dest);
  catalog.push({
    id: sid,
    text: entry.text,
    file,
    color: entry.color,
    category: entry.category,
    shortcut: entry.shortcut || undefined,
  });
  console.log('seeded', entry.text, '←', entry.file);
}

await writeFile(path.join(DATA, 'catalog.json'), JSON.stringify(catalog, null, 2));
await writeFile(path.join(DATA, 'SEED_VERSION'), SEED_VERSION);
console.log('wrote catalog with', catalog.length, 'CC0 sounds (seed', SEED_VERSION + ')');
