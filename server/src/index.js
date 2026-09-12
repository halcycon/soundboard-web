import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Catalog, COLORS } from './catalog.js';
import { AudioMixer } from './mixer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8787);
const API_TOKEN = process.env.API_TOKEN || '';
const CLIENT_DIST = path.join(ROOT, 'client/dist');

await mkdir(DATA_DIR, { recursive: true });

const settingsPath = path.join(DATA_DIR, 'settings.json');
/** @type {{ rtmpUrl: string, masterGain: number, localMonitorDefault: boolean, autoStartRtmp: boolean }} */
let settings = {
  rtmpUrl: process.env.MUXSHED_RTMP_URL || '',
  masterGain: 1,
  localMonitorDefault: true,
  autoStartRtmp: true,
};
if (existsSync(settingsPath)) {
  try {
    settings = { ...settings, ...JSON.parse(await readFile(settingsPath, 'utf8')) };
  } catch {
    /* keep defaults */
  }
}
if (process.env.MUXSHED_RTMP_URL) settings.rtmpUrl = process.env.MUXSHED_RTMP_URL;

async function saveSettings() {
  await writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

const catalog = new Catalog(DATA_DIR);
await catalog.init();

const mixer = new AudioMixer({
  rtmpUrl: settings.rtmpUrl,
  masterGain: settings.masterGain,
});

/** @type {Set<import('ws').WebSocket>} */
const sockets = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(data);
  }
}

mixer.on('status', (status) => broadcast({ type: 'status', status }));
mixer.on('play', (p) => broadcast({ type: 'play', ...p }));
mixer.on('stop', (p) => broadcast({ type: 'stop', ...p }));

if (settings.autoStartRtmp && settings.rtmpUrl) {
  mixer.startPublisher();
}

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Token'],
  }),
);

/** @param {import('hono').Context} c */
function checkAuth(c) {
  if (!API_TOKEN) return true;
  const header =
    c.req.header('X-API-Token') || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const query = c.req.query('token');
  return header === API_TOKEN || query === API_TOKEN;
}

app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  if (!checkAuth(c)) return c.json({ error: 'unauthorized' }, 401);
  return next();
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    sounds: catalog.list().length,
    mixer: mixer.getStatus(),
  }),
);

app.get('/api/status', (c) => c.json(mixer.getStatus()));

app.get('/api/settings', (c) =>
  c.json({
    ...settings,
    colors: COLORS,
    authRequired: Boolean(API_TOKEN),
  }),
);

app.patch('/api/settings', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.rtmpUrl === 'string') {
    settings.rtmpUrl = body.rtmpUrl.trim();
    mixer.setRtmpUrl(settings.rtmpUrl);
  }
  if (typeof body.masterGain === 'number') {
    settings.masterGain = body.masterGain;
    mixer.setMasterGain(settings.masterGain);
  }
  if (typeof body.localMonitorDefault === 'boolean') {
    settings.localMonitorDefault = body.localMonitorDefault;
  }
  if (typeof body.autoStartRtmp === 'boolean') {
    settings.autoStartRtmp = body.autoStartRtmp;
  }
  await saveSettings();
  broadcast({ type: 'settings', settings });
  return c.json(settings);
});

app.post('/api/rtmp/start', (c) => {
  const ok = mixer.startPublisher();
  return c.json({ ok, status: mixer.getStatus() }, ok ? 200 : 400);
});

app.post('/api/rtmp/stop', (c) => {
  mixer.stopPublisher();
  return c.json({ ok: true, status: mixer.getStatus() });
});

app.get('/api/sounds', (c) => c.json(catalog.list()));

app.get('/api/sounds/:id', (c) => {
  const sound = catalog.get(c.req.param('id'));
  if (!sound) return c.json({ error: 'not found' }, 404);
  return c.json(sound);
});

app.get('/api/sounds/:id/file', async (c) => {
  const id = c.req.param('id');
  const filePath = catalog.filePath(id);
  if (!filePath || !existsSync(filePath)) return c.json({ error: 'not found' }, 404);
  const buf = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === '.wav'
      ? 'audio/wav'
      : ext === '.ogg'
        ? 'audio/ogg'
        : ext === '.m4a'
          ? 'audio/mp4'
          : 'audio/mpeg';
  return c.body(buf, 200, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=3600',
  });
});

app.post('/api/sounds', async (c) => {
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'expected multipart/form-data' }, 400);
  }
  const form = await c.req.parseBody({ all: true });
  const file = form.file;
  if (!file || typeof file === 'string') {
    return c.json({ error: 'file required' }, 400);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return c.json({ error: 'empty file' }, 400);
  if (buffer.length > 50 * 1024 * 1024) return c.json({ error: 'file too large (50MB max)' }, 400);

  const sound = await catalog.add({
    text: String(form.text || ''),
    category: String(form.category || 'General'),
    color: String(form.color || 'blue'),
    shortcut: form.shortcut ? String(form.shortcut) : undefined,
    originalName: file.name || 'sound.mp3',
    buffer,
  });
  broadcast({ type: 'catalog', sounds: catalog.list() });
  return c.json(sound, 201);
});

app.patch('/api/sounds/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sound = await catalog.update(c.req.param('id'), body);
  if (!sound) return c.json({ error: 'not found' }, 404);
  broadcast({ type: 'catalog', sounds: catalog.list() });
  return c.json(sound);
});

app.delete('/api/sounds/:id', async (c) => {
  const id = c.req.param('id');
  mixer.stopSound(id);
  mixer.invalidateCache(id);
  const ok = await catalog.remove(id);
  if (!ok) return c.json({ error: 'not found' }, 404);
  broadcast({ type: 'catalog', sounds: catalog.list() });
  return c.json({ ok: true });
});

app.post('/api/sounds/:id/play', async (c) => {
  const id = c.req.param('id');
  const sound = catalog.get(id);
  const filePath = catalog.filePath(id);
  if (!sound || !filePath) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  try {
    const voiceId = await mixer.play(id, filePath, {
      restart: body.restart !== false,
      gain: typeof body.gain === 'number' ? body.gain : 1,
    });
    return c.json({ ok: true, voiceId, sound });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/sounds/:id/stop', (c) => {
  const id = c.req.param('id');
  if (!catalog.get(id)) return c.json({ error: 'not found' }, 404);
  mixer.stopSound(id);
  return c.json({ ok: true });
});

app.post('/api/stop-all', (c) => {
  mixer.stopAll();
  return c.json({ ok: true });
});

if (existsSync(CLIENT_DIST)) {
  app.use('/*', serveStatic({ root: CLIENT_DIST }));
  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api') || c.req.path === '/ws') {
      return c.json({ error: 'not found' }, 404);
    }
    const html = await readFile(path.join(CLIENT_DIST, 'index.html'), 'utf8');
    return c.html(html);
  });
} else {
  app.get('/', (c) =>
    c.html(
      `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
      <h1>web-soundboard API</h1>
      <p>Client not built yet. Run <code>npm run dev</code> or <code>npm run build</code>.</p>
      <p>API: <a href="/api/health">/api/health</a></p>
      </body></html>`,
    ),
  );
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`web-soundboard listening on http://0.0.0.0:${info.port}`);
  console.log(`data dir: ${DATA_DIR}`);
  console.log(`rtmp configured: ${Boolean(settings.rtmpUrl)}`);
});

server.on('error', (err) => {
  console.error('HTTP server error:', err);
  process.exit(1);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url || '', 'http://localhost');
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  if (API_TOKEN) {
    const url = new URL(req.url || '', 'http://localhost');
    if (url.searchParams.get('token') !== API_TOKEN) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  sockets.add(ws);
  ws.send(
    JSON.stringify({ type: 'hello', status: mixer.getStatus(), sounds: catalog.list(), settings }),
  );
  ws.on('close', () => sockets.delete(ws));
});

process.on('SIGINT', () => {
  mixer.stopPublisher();
  process.exit(0);
});
process.on('SIGTERM', () => {
  mixer.stopPublisher();
  process.exit(0);
});
