import './styles.css';
import {
  connectWs,
  deleteSound,
  getSettings,
  getToken,
  listSounds,
  patchSettings,
  playSound,
  setToken,
  startRtmp,
  stopAll,
  stopRtmp,
  stopSound,
  updateSound,
  uploadSound,
} from './api.js';
import { connectStreamDeck, webHidSupported } from './webhid.js';

/** @type {import('./api.js')[]} */
let sounds = [];
let settings = {
  rtmpUrl: '',
  masterGain: 1,
  localMonitorDefault: true,
  colors: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'teal', 'pink'],
  authRequired: false,
};
let status = { publishing: false, configured: false, activeVoices: 0, lastError: null };
let query = '';
let localMonitor = true;
let vibrate = true;
/** @type {Set<string>} */
const playing = new Set();
/** @type {Map<string, HTMLAudioElement>} */
const localAudio = new Map();
let deck = null;
let online = navigator.onLine;
let lastError = '';
let playingLabel = '';

const app = document.getElementById('app');

function haptic() {
  if (vibrate && navigator.vibrate) navigator.vibrate(25);
}

function fileUrl(id) {
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `/api/sounds/${id}/file${qs}`;
}

function showError(msg) {
  lastError = msg || '';
  const el = document.getElementById('error-banner');
  if (!el) {
    render();
    return;
  }
  if (!lastError) {
    el.classList.remove('show');
    el.textContent = '';
    return;
  }
  el.textContent = lastError;
  el.classList.add('show');
}

function setPlayingLabel(text) {
  playingLabel = text || '';
  const el = document.getElementById('playing-toast');
  if (!el) return;
  if (!playingLabel) {
    el.classList.remove('show');
    el.textContent = '';
    return;
  }
  el.textContent = `Playing: ${playingLabel}`;
  el.classList.add('show');
}

function updateStatusPills() {
  const host = document.getElementById('status-row');
  if (!host) return;
  host.innerHTML = `
    ${statusPill()}
    <span class="pill">Voices ${status.activeVoices || 0}</span>
    ${status.lastError ? `<span class="pill err" title="${escapeAttr(status.lastError)}">RTMP err</span>` : ''}
  `;
}

async function playLocalMonitor(sound) {
  if (!localMonitor) return;
  let audio = localAudio.get(sound.id);
  if (!audio) {
    audio = new Audio(fileUrl(sound.id));
    localAudio.set(sound.id, audio);
  }
  audio.currentTime = 0;
  await audio.play();
  audio.onended = () => {
    playing.delete(sound.id);
    if (playingLabel === sound.text) setPlayingLabel('');
    renderPadsOnly();
  };
}

async function triggerPlay(sound) {
  haptic();
  showError('');
  playing.add(sound.id);
  setPlayingLabel(sound.text);
  renderPadsOnly();

  // Local preview immediately (user gesture) — don't wait on server decode.
  const localPromise = playLocalMonitor(sound).catch((err) => {
    showError(`Local monitor failed: ${err?.message || err}`);
  });

  try {
    await playSound(sound.id);
  } catch (err) {
    showError(`On-air play failed: ${err?.message || err}`);
    console.error(err);
  }

  await localPromise;

  if (!localMonitor) {
    setTimeout(() => {
      playing.delete(sound.id);
      if (playingLabel === sound.text) setPlayingLabel('');
      renderPadsOnly();
    }, 600);
  }
}

function filteredSounds() {
  const q = query.trim().toLowerCase();
  if (!q) return sounds;
  return sounds.filter(
    (s) =>
      s.text.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.shortcut || '').toLowerCase().includes(q),
  );
}

function groupByCategory(list) {
  /** @type {Map<string, typeof sounds>} */
  const map = new Map();
  for (const s of list) {
    const key = s.category || 'General';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function statusPill() {
  if (!online) return `<span class="pill err">Offline</span>`;
  if (!status.configured) return `<span class="pill warn">RTMP not set</span>`;
  if (status.publishing) return `<span class="pill ok">RTMP live</span>`;
  return `<span class="pill warn">RTMP stopped</span>`;
}

function renderPadsOnly() {
  const host = document.getElementById('board');
  if (!host) return;
  host.innerHTML = boardHtml();
  bindPadEvents(host);
}

function boardHtml() {
  const list = filteredSounds();
  if (!list.length) {
    return `<div class="empty">No sounds yet. Upload a clip to get started.</div>`;
  }
  return groupByCategory(list)
    .map(
      ([category, items]) => `
      <section class="category">
        <h2>${escapeHtml(category)}</h2>
        <div class="pads">
          ${items
            .map(
              (s) => `
            <button class="pad ${escapeHtml(s.color)} ${playing.has(s.id) ? 'playing' : ''}" data-id="${s.id}" type="button">
              ${s.shortcut ? `<span class="shortcut">${escapeHtml(s.shortcut)}</span>` : ''}
              ${escapeHtml(s.text)}
              <span class="edit" data-edit="${s.id}" title="Edit">✎</span>
            </button>`,
            )
            .join('')}
        </div>
      </section>`,
    )
    .join('');
}

function render() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img src="/icons/icon-192.png" alt="" width="40" height="40" />
        <div>
          <h1>Web Soundboard</h1>
          <p>Server mix → muxshed RTMP · phone/desktop remote</p>
        </div>
      </div>
      <div class="status-row" id="status-row">
        ${statusPill()}
        <span class="pill">Voices ${status.activeVoices || 0}</span>
        ${status.lastError ? `<span class="pill err" title="${escapeAttr(status.lastError)}">RTMP err</span>` : ''}
      </div>
    </header>

    <div class="offline-banner ${online ? '' : 'show'}">
      You’re offline. On-air play needs the Docker mixer — reconnect to Tailscale / network.
    </div>
    <div class="error-banner ${lastError ? 'show' : ''}" id="error-banner">${escapeHtml(lastError)}</div>
    <div class="playing-toast ${playingLabel ? 'show' : ''}" id="playing-toast">${playingLabel ? `Playing: ${escapeHtml(playingLabel)}` : ''}</div>

    <div class="dock">
      <button class="btn danger" id="btn-stop-all" type="button">Stop all</button>
      <button class="btn" id="btn-shuffle" type="button">Shuffle</button>
      <button class="btn" id="btn-upload" type="button">Upload</button>
      <button class="btn" id="btn-settings" type="button">Settings</button>
      ${webHidSupported() ? `<button class="btn" id="btn-deck" type="button">${deck ? 'Deck linked' : 'Stream Deck'}</button>` : ''}
    </div>

    <div class="toolbar">
      <input id="search" type="search" placeholder="Search sounds…" value="${escapeAttr(query)}" />
      <div class="actions">
        <label class="pill" title="Play a local preview on this device">
          <input id="monitor" type="checkbox" ${localMonitor ? 'checked' : ''} />
          Monitor
        </label>
      </div>
    </div>

    <main id="board">${boardHtml()}</main>
  `;

  document.getElementById('search').addEventListener('input', (e) => {
    query = e.target.value;
    renderPadsOnly();
  });
  document.getElementById('monitor').addEventListener('change', (e) => {
    localMonitor = e.target.checked;
  });
  document.getElementById('btn-stop-all').onclick = async () => {
    await stopAll();
    for (const a of localAudio.values()) {
      a.pause();
      a.currentTime = 0;
    }
    playing.clear();
    renderPadsOnly();
  };
  document.getElementById('btn-shuffle').onclick = () => {
    if (!sounds.length) return;
    const s = sounds[Math.floor(Math.random() * sounds.length)];
    triggerPlay(s);
  };
  document.getElementById('btn-upload').onclick = () => openUploadModal();
  document.getElementById('btn-settings').onclick = () => openSettingsModal();
  const deckBtn = document.getElementById('btn-deck');
  if (deckBtn) {
    deckBtn.onclick = async () => {
      try {
        if (deck) {
          await deck.close();
          deck = null;
          render();
          return;
        }
        deck = await connectStreamDeck((index) => {
          const ordered = filteredSounds();
          const sound = ordered[index];
          if (sound) triggerPlay(sound);
        });
        render();
      } catch (err) {
        alert(err.message || String(err));
      }
    };
  }
  bindPadEvents(document.getElementById('board'));
}

function bindPadEvents(host) {
  host.querySelectorAll('.pad').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit]')) return;
      const sound = sounds.find((s) => s.id === btn.dataset.id);
      if (sound) triggerPlay(sound);
    });
  });
  host.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sound = sounds.find((s) => s.id === btn.getAttribute('data-edit'));
      if (sound) openEditModal(sound);
    });
  });
}

function openUploadModal() {
  openModal(
    'Upload sound',
    `
    <form class="form-grid" id="upload-form">
      <label>Audio file<input name="file" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" required /></label>
      <label>Label<input name="text" type="text" placeholder="Airhorn" /></label>
      <label>Category<input name="category" type="text" value="General" /></label>
      <label>Color
        <select name="color">
          ${settings.colors.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </label>
      <label>Shortcut key<input name="shortcut" type="text" maxlength="1" placeholder="1" /></label>
      <div class="form-actions">
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn primary" type="submit">Upload</button>
      </div>
    </form>`,
    (root) => {
      root.querySelector('#upload-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await uploadSound(fd);
          closeModal();
          sounds = await listSounds();
          render();
        } catch (err) {
          alert(err.message || String(err));
        }
      };
    },
  );
}

function openEditModal(sound) {
  openModal(
    'Edit sound',
    `
    <form class="form-grid" id="edit-form">
      <label>Label<input name="text" type="text" value="${escapeAttr(sound.text)}" /></label>
      <label>Category<input name="category" type="text" value="${escapeAttr(sound.category)}" /></label>
      <label>Color
        <select name="color">
          ${settings.colors
            .map((c) => `<option value="${c}" ${c === sound.color ? 'selected' : ''}>${c}</option>`)
            .join('')}
        </select>
      </label>
      <label>Shortcut key<input name="shortcut" type="text" maxlength="1" value="${escapeAttr(sound.shortcut || '')}" /></label>
      <div class="form-actions">
        <button class="btn danger" type="button" id="delete-sound">Delete</button>
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn primary" type="submit">Save</button>
      </div>
    </form>`,
    (root) => {
      root.querySelector('#delete-sound').onclick = async () => {
        if (!confirm(`Delete “${sound.text}”?`)) return;
        await deleteSound(sound.id);
        closeModal();
        sounds = await listSounds();
        render();
      };
      root.querySelector('#edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await updateSound(sound.id, {
          text: fd.get('text'),
          category: fd.get('category'),
          color: fd.get('color'),
          shortcut: fd.get('shortcut') || null,
        });
        closeModal();
        sounds = await listSounds();
        render();
      };
    },
  );
}

function openSettingsModal() {
  openModal(
    'Settings',
    `
    <form class="form-grid" id="settings-form">
      <label>Muxshed RTMP URL
        <input name="rtmpUrl" type="text" placeholder="rtmp://muxshed:1935/live/STREAMKEY" value="${escapeAttr(settings.rtmpUrl || '')}" />
      </label>
      <label>Master gain (0–2)
        <input name="masterGain" type="number" min="0" max="2" step="0.05" value="${settings.masterGain ?? 1}" />
      </label>
      <label>API token (if required)
        <input name="token" type="password" autocomplete="off" value="${escapeAttr(getToken())}" placeholder="optional" />
      </label>
      <label><input name="vibrate" type="checkbox" ${vibrate ? 'checked' : ''} /> Haptic feedback</label>
      <label><input name="localMonitorDefault" type="checkbox" ${settings.localMonitorDefault ? 'checked' : ''} /> Default local monitor on</label>
      <label><input name="autoStartRtmp" type="checkbox" ${settings.autoStartRtmp ? 'checked' : ''} /> Auto-start RTMP on boot</label>
      <div class="form-actions">
        <button class="btn" type="button" id="rtmp-start">Start RTMP</button>
        <button class="btn" type="button" id="rtmp-stop">Stop RTMP</button>
        <button class="btn" type="button" data-close>Close</button>
        <button class="btn primary" type="submit">Save</button>
      </div>
      <p style="color:var(--muted);font-size:0.85rem;margin:0">
        Create an <strong>audio_only</strong> RTMP source in muxshed, then Mix + Duck that strip.
        Companion: Generic HTTP → <code>POST /api/sounds/:id/play</code>
      </p>
    </form>`,
    (root) => {
      root.querySelector('#rtmp-start').onclick = async () => {
        try {
          const res = await startRtmp();
          status = res.status || status;
          render();
        } catch (err) {
          alert(err.message || String(err));
        }
      };
      root.querySelector('#rtmp-stop').onclick = async () => {
        const res = await stopRtmp();
        status = res.status || status;
        render();
      };
      root.querySelector('#settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        setToken(String(fd.get('token') || ''));
        vibrate = Boolean(fd.get('vibrate'));
        localStorage.setItem('wsb_vibrate', vibrate ? '1' : '0');
        settings = await patchSettings({
          rtmpUrl: String(fd.get('rtmpUrl') || ''),
          masterGain: Number(fd.get('masterGain')),
          localMonitorDefault: Boolean(fd.get('localMonitorDefault')),
          autoStartRtmp: Boolean(fd.get('autoStartRtmp')),
        });
        localMonitor = settings.localMonitorDefault;
        closeModal();
        render();
      };
    },
  );
}

function openModal(title, body, bind) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal"><h2>${escapeHtml(title)}</h2>${body}</div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) closeModal();
  });
  document.body.appendChild(wrap);
  bind?.(wrap);
}

function closeModal() {
  document.getElementById('modal')?.remove();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", '&#39;');
}

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  const key = e.key.toLowerCase();
  if (key === 'escape') {
    stopAll();
    for (const a of localAudio.values()) {
      a.pause();
      a.currentTime = 0;
    }
    playing.clear();
    renderPadsOnly();
    return;
  }
  const sound = sounds.find((s) => (s.shortcut || '').toLowerCase() === key);
  if (sound) {
    e.preventDefault();
    triggerPlay(sound);
  }
});

window.addEventListener('online', () => {
  online = true;
  render();
});
window.addEventListener('offline', () => {
  online = false;
  render();
});

async function boot() {
  vibrate = localStorage.getItem('wsb_vibrate') !== '0';
  try {
    settings = await getSettings();
    localMonitor = settings.localMonitorDefault !== false;
    sounds = await listSounds();
  } catch (err) {
    online = false;
    console.error(err);
  }
  render();

  let ws;
  const connect = () => {
    ws = connectWs((msg) => {
      if (msg.type === 'hello' || msg.type === 'catalog') {
        if (msg.sounds) sounds = msg.sounds;
        if (msg.settings) settings = { ...settings, ...msg.settings };
        if (msg.status) status = msg.status;
        render();
      } else if (msg.type === 'status') {
        status = msg.status;
        updateStatusPills();
      } else if (msg.type === 'settings') {
        settings = { ...settings, ...msg.settings };
      } else if (msg.type === 'play') {
        playing.add(msg.soundId);
        const s = sounds.find((x) => x.id === msg.soundId);
        if (s) setPlayingLabel(s.text);
        updateStatusPills();
        renderPadsOnly();
      } else if (msg.type === 'stop') {
        if (msg.soundId === '*') {
          playing.clear();
          setPlayingLabel('');
        } else {
          playing.delete(msg.soundId);
        }
        updateStatusPills();
        renderPadsOnly();
      }
    });
    ws.addEventListener('close', () => setTimeout(connect, 2000));
  };
  connect();
}

boot();
