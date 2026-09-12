import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const FRAME_BYTES = CHANNELS * BYTES_PER_SAMPLE;
const CHUNK_MS = 20;
const SAMPLES_PER_CHUNK = (SAMPLE_RATE * CHUNK_MS) / 1000;
const CHUNK_BYTES = SAMPLES_PER_CHUNK * FRAME_BYTES;

/**
 * @typedef {{ id: string, soundId: string, samples: Int16Array, offset: number, gain: number }} Voice
 */

export class AudioMixer extends EventEmitter {
  /**
   * @param {{ rtmpUrl?: string, masterGain?: number }} opts
   */
  constructor(opts = {}) {
    super();
    this.rtmpUrl = opts.rtmpUrl || '';
    this.masterGain = opts.masterGain ?? 1;
    /** @type {Voice[]} */
    this.voices = [];
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    this.ffmpeg = null;
    this.timer = null;
    this.publishing = false;
    this.lastError = null;
    /** @type {Map<string, Int16Array>} */
    this.pcmCache = new Map();
    this._voiceSeq = 0;
    this._wantPublish = false;
  }

  getStatus() {
    return {
      publishing: this.publishing,
      rtmpUrl: this.rtmpUrl ? redactUrl(this.rtmpUrl) : '',
      configured: Boolean(this.rtmpUrl),
      activeVoices: this.voices.length,
      lastError: this.lastError,
      masterGain: this.masterGain,
    };
  }

  /** @param {string} url */
  setRtmpUrl(url) {
    const next = (url || '').trim();
    if (next === this.rtmpUrl) return;
    this.rtmpUrl = next;
    if (this.publishing || this._wantPublish) {
      this.stopPublisher();
      if (this.rtmpUrl) this.startPublisher();
    }
  }

  /** @param {number} gain */
  setMasterGain(gain) {
    this.masterGain = Math.min(2, Math.max(0, gain));
  }

  startPublisher() {
    if (!this.rtmpUrl) {
      this.lastError = 'RTMP URL not configured';
      this.emit('status', this.getStatus());
      return false;
    }
    if (this.ffmpeg) return true;

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      's16le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-i',
      'pipe:0',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-f',
      'flv',
      this.rtmpUrl,
    ];

    this.ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.lastError = null;
    this.publishing = true;
    let stderrBuf = '';

    this.ffmpeg.stderr.on('data', (buf) => {
      stderrBuf += buf.toString();
      if (stderrBuf.length > 2000) stderrBuf = stderrBuf.slice(-2000);
      const msg = buf.toString().trim();
      if (msg) {
        this.lastError = msg.slice(0, 500);
        this.emit('status', this.getStatus());
      }
    });

    this.ffmpeg.on('exit', (code, signal) => {
      this.ffmpeg = null;
      this.publishing = false;
      if (code !== 0 && code !== null) {
        const detail = stderrBuf.trim().split('\n').filter(Boolean).pop();
        this.lastError = detail || `ffmpeg exited (${code}${signal ? `/${signal}` : ''})`;
      }
      this._maybeStopClock();
      this.emit('status', this.getStatus());
      // Soft reconnect if URL still configured
      if (this.rtmpUrl && this._wantPublish) {
        setTimeout(() => {
          if (this._wantPublish && this.rtmpUrl && !this.ffmpeg) this.startPublisher();
        }, 2000);
      }
    });

    this._wantPublish = true;
    this._ensureClock();
    this.emit('status', this.getStatus());
    return true;
  }

  stopPublisher() {
    this._wantPublish = false;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.stdin.end();
      } catch {
        /* ignore */
      }
      this.ffmpeg.kill('SIGTERM');
      this.ffmpeg = null;
    }
    this.publishing = false;
    this._maybeStopClock();
    this.emit('status', this.getStatus());
  }

  /**
   * Decode audio file to Int16 stereo PCM @ 48kHz (cached).
   * @param {string} soundId
   * @param {string} filePath
   */
  async decode(soundId, filePath) {
    const cached = this.pcmCache.get(soundId);
    if (cached) return cached;

    const samples = await decodeFileToPcm(filePath);
    this.pcmCache.set(soundId, samples);
    return samples;
  }

  /** @param {string} soundId */
  invalidateCache(soundId) {
    this.pcmCache.delete(soundId);
  }

  /**
   * @param {string} soundId
   * @param {string} filePath
   * @param {{ gain?: number, restart?: boolean }} [opts]
   */
  async play(soundId, filePath, opts = {}) {
    if (opts.restart) {
      this.voices = this.voices.filter((v) => v.soundId !== soundId);
    }
    const samples = await this.decode(soundId, filePath);
    const voice = {
      id: `v${++this._voiceSeq}`,
      soundId,
      samples,
      offset: 0,
      gain: opts.gain ?? 1,
    };
    this.voices.push(voice);
    this._ensureClock();
    this.emit('play', { soundId, voiceId: voice.id });
    this.emit('status', this.getStatus());
    return voice.id;
  }

  /** @param {string} soundId */
  stopSound(soundId) {
    const before = this.voices.length;
    this.voices = this.voices.filter((v) => v.soundId !== soundId);
    if (this.voices.length !== before) {
      this.emit('stop', { soundId });
      this.emit('status', this.getStatus());
    }
    this._maybeStopClock();
  }

  stopAll() {
    if (this.voices.length === 0) return;
    this.voices = [];
    this.emit('stop', { soundId: '*' });
    this.emit('status', this.getStatus());
    this._maybeStopClock();
  }

  _ensureClock() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), CHUNK_MS);
  }

  _maybeStopClock() {
    if (this.publishing) return;
    if (this.voices.length > 0) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _tick() {
    const mixed = new Int16Array(SAMPLES_PER_CHUNK * CHANNELS);
    const still = [];

    for (const voice of this.voices) {
      const remaining = voice.samples.length - voice.offset;
      const frames = Math.min(SAMPLES_PER_CHUNK, Math.floor(remaining / CHANNELS));
      for (let i = 0; i < frames * CHANNELS; i++) {
        const sample = voice.samples[voice.offset + i] * voice.gain * this.masterGain;
        const sum = mixed[i] + sample;
        mixed[i] = sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum;
      }
      voice.offset += frames * CHANNELS;
      if (voice.offset < voice.samples.length) still.push(voice);
    }
    this.voices = still;

    if (this.ffmpeg?.stdin?.writable) {
      const buf = Buffer.from(mixed.buffer, mixed.byteOffset, mixed.byteLength);
      try {
        this.ffmpeg.stdin.write(buf);
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.emit('status', this.getStatus());
      }
    }

    if (still.length === 0) {
      this.emit('status', this.getStatus());
      this._maybeStopClock();
    }
  }
}

/** @param {string} filePath */
function decodeFileToPcm(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-f',
      's16le',
      '-ac',
      String(CHANNELS),
      '-ar',
      String(SAMPLE_RATE),
      'pipe:1',
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const chunks = [];
    let err = '';
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (c) => {
      err += c.toString();
    });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `ffmpeg decode failed (${code})`));
        return;
      }
      const buf = Buffer.concat(chunks);
      // Ensure even length for Int16
      const even = buf.byteLength - (buf.byteLength % 2);
      resolve(new Int16Array(buf.buffer, buf.byteOffset, even / 2));
    });
  });
}

/** @param {string} url */
function redactUrl(url) {
  try {
    const u = new URL(url.replace(/^rtmp/i, 'http'));
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length) parts[parts.length - 1] = '***';
    return `rtmp://${u.host}/${parts.join('/')}`;
  } catch {
    return 'rtmp://***';
  }
}

export { SAMPLE_RATE, CHANNELS, CHUNK_MS };
