#!/usr/bin/env node
/**
 * Generate original demo samples (no third-party copyrighted clips).
 * Daft Punk / meme packs from example repos are NOT redistributable.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const SOUNDS = path.join(DATA, 'sounds');
const SEED_VERSION = '3';

function newId() {
  return randomBytes(5).toString('hex');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (c) => {
      err += c.toString();
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
  });
}

/** @param {string} out @param {string[]} filterGraph lavfi / filter_complex pieces */
async function renderMp3(out, args) {
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args, '-c:a', 'libmp3lame', '-q:a', '4', out]);
}

const samples = [
  {
    text: 'Click',
    category: 'UI',
    color: 'teal',
    shortcut: '1',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1400:duration=0.06',
      '-af',
      'afade=t=in:d=0.002,afade=t=out:st=0.02:d=0.04,volume=0.7',
    ],
  },
  {
    text: 'Pop',
    category: 'UI',
    color: 'blue',
    shortcut: '2',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=520:duration=0.12',
      '-af',
      'afade=t=in:d=0.005,afade=t=out:st=0.04:d=0.08,volume=0.85',
    ],
  },
  {
    text: 'Notify',
    category: 'UI',
    color: 'green',
    shortcut: '3',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=0.12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1320:duration=0.18',
      '-filter_complex',
      '[0]afade=t=out:st=0.06:d=0.06,volume=0.55[a0];[1]adelay=90|90,afade=t=out:st=0.1:d=0.08,volume=0.55[a1];[a0][a1]amix=inputs=2:duration=longest',
    ],
  },
  {
    text: 'Rimshot',
    category: 'FX',
    color: 'orange',
    shortcut: '4',
    args: [
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=d=0.09:c=white:r=48000',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=180:duration=0.12',
      '-filter_complex',
      '[0]afade=t=out:st=0.01:d=0.08,highpass=f=800,volume=0.9[n];[1]afade=t=out:st=0.03:d=0.09,volume=0.45[s];[n][s]amix=inputs=2:duration=longest',
    ],
  },
  {
    text: 'Whoosh',
    category: 'FX',
    color: 'purple',
    shortcut: '5',
    args: [
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=d=0.55:c=pink:r=48000',
      '-af',
      'highpass=f=400,lowpass=f=4000,afade=t=in:d=0.12,afade=t=out:st=0.28:d=0.27,volume=0.55',
    ],
  },
  {
    text: 'Laser',
    category: 'FX',
    color: 'pink',
    shortcut: '6',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1200:duration=0.35',
      '-af',
      'asetrate=48000*0.55,aresample=48000,afade=t=in:d=0.01,afade=t=out:st=0.12:d=0.22,volume=0.65',
    ],
  },
  {
    text: 'Power Up',
    category: 'Stingers',
    color: 'yellow',
    shortcut: '7',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=300:duration=0.5',
      '-af',
      'vibrato=f=6:d=0.4,afade=t=in:d=0.02,afade=t=out:st=0.32:d=0.18,volume=0.7',
    ],
  },
  {
    text: 'Fanfare',
    category: 'Stingers',
    color: 'red',
    shortcut: '8',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=523.25:duration=0.18',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=659.25:duration=0.18',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=783.99:duration=0.35',
      '-filter_complex',
      '[0]volume=0.5[a0];[1]adelay=160|160,volume=0.5[a1];[2]adelay=320|320,afade=t=out:st=0.18:d=0.17,volume=0.55[a2];[a0][a1][a2]amix=inputs=3:duration=longest',
    ],
  },
  {
    text: 'Buzzer',
    category: 'FX',
    color: 'red',
    shortcut: '9',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=140:duration=0.55',
      '-af',
      'tremolo=f=18:d=0.8,afade=t=in:d=0.01,afade=t=out:st=0.4:d=0.15,volume=0.75',
    ],
  },
  {
    text: 'Coin',
    category: 'Stingers',
    color: 'yellow',
    shortcut: '0',
    args: [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=988:duration=0.08',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1319:duration=0.22',
      '-filter_complex',
      '[0]afade=t=out:st=0.04:d=0.04,volume=0.55[a0];[1]adelay=70|70,afade=t=out:st=0.1:d=0.12,volume=0.55[a1];[a0][a1]amix=inputs=2:duration=longest',
    ],
  },
];

await mkdir(SOUNDS, { recursive: true });
const catalog = [];

for (const s of samples) {
  const sid = newId();
  const file = `${sid}.mp3`;
  const out = path.join(SOUNDS, file);
  await renderMp3(out, s.args);
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
await writeFile(path.join(DATA, 'SEED_VERSION'), SEED_VERSION);
console.log('wrote catalog with', catalog.length, 'sounds (seed', SEED_VERSION + ')');
