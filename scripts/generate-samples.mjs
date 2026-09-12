#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const SOUNDS = path.join(DATA, 'sounds');

function newId() {
  return randomBytes(5).toString('hex');
}

const samples = [
  { text: 'Beep', category: 'FX', color: 'blue', freq: 880, dur: 0.25, shortcut: '1' },
  { text: 'Boop', category: 'FX', color: 'teal', freq: 440, dur: 0.35, shortcut: '2' },
  { text: 'Buzz', category: 'FX', color: 'orange', freq: 220, dur: 0.45, shortcut: '3' },
  { text: 'Chime', category: 'Stingers', color: 'green', freq: 660, dur: 0.6, shortcut: '4' },
];

function ffmpegPromise(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (c) => {
      err += c.toString();
    });
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
  });
}

await mkdir(SOUNDS, { recursive: true });
const catalog = [];

for (const s of samples) {
  const sid = newId();
  const file = `${sid}.mp3`;
  const out = path.join(SOUNDS, file);
  await ffmpegPromise([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${s.freq}:duration=${s.dur}`,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    out,
  ]);
  catalog.push({
    id: sid,
    text: s.text,
    file,
    color: s.color,
    category: s.category,
    shortcut: s.shortcut,
  });
  console.log('generated', s.text, '→', file);
}

await writeFile(path.join(DATA, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log('wrote catalog with', catalog.length, 'sounds');
