const TOKEN_KEY = 'wsb_api_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { ...extra };
  if (token) headers['X-API-Token'] = token;
  return headers;
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'request failed');
  return data;
}

export async function api(path, opts = {}) {
  const headers = authHeaders(opts.headers || {});
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, { ...opts, headers });
  return parse(res);
}

export function playSound(id, body = {}) {
  return api(`/api/sounds/${id}/play`, { method: 'POST', body: JSON.stringify(body) });
}

export function stopSound(id) {
  return api(`/api/sounds/${id}/stop`, { method: 'POST', body: '{}' });
}

export function stopAll() {
  return api('/api/stop-all', { method: 'POST', body: '{}' });
}

export function listSounds() {
  return api('/api/sounds');
}

export function getSettings() {
  return api('/api/settings');
}

export function patchSettings(body) {
  return api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
}

export function uploadSound(formData) {
  return api('/api/sounds', { method: 'POST', body: formData });
}

export function updateSound(id, body) {
  return api(`/api/sounds/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteSound(id) {
  return api(`/api/sounds/${id}`, { method: 'DELETE' });
}

export function startRtmp() {
  return api('/api/rtmp/start', { method: 'POST', body: '{}' });
}

export function stopRtmp() {
  return api('/api/rtmp/stop', { method: 'POST', body: '{}' });
}

export function connectWs(onMessage) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const ws = new WebSocket(`${proto}//${location.host}/ws${qs}`);
  ws.addEventListener('message', (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  });
  return ws;
}
