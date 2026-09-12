# Web Soundboard

Responsive browser soundboard that mixes clips on the server and publishes continuous **AAC stereo 48 kHz** RTMP into [muxshed](https://github.com/muxshed/shed) (`audio_only` sources). Control from desktop, phone PWA, Bitfocus Companion (Generic HTTP), or optional Chromium WebHID Stream Deck.

## Deploy (Docker / Arcane)

Clone and run — compose lives at the **repo root** so Arcane Git Sync can pull the full build context:

```bash
git clone git@github.com:halcycon/soundboard-web.git
cd soundboard-web
cp .env.example .env   # set MUXSHED_RTMP_URL
docker compose up --build -d
```

Open `http://<host>:8787`. Put the UI behind Cloudflare Access or Tailscale. Keep RTMP on LAN/VPN to muxshed (not through the HTTPS tunnel).

### Arcane

1. Customization → Git Repositories → add `git@github.com:halcycon/soundboard-web.git` (SSH).
2. Projects → Create → **From Git Repo**.
3. Compose File Path: `compose.yaml`
4. Enable **Sync Files** / directory sync (needed so `Dockerfile` + source are present for `build`).
5. Set env: `MUXSHED_RTMP_URL`, optional `API_TOKEN`.
6. Deploy / start the project.

First boot seeds a few sample tones into the data volume if the catalog is empty.

### Environment

| Variable | Meaning |
|----------|---------|
| `MUXSHED_RTMP_URL` | Full RTMP publish URL |
| `API_TOKEN` | Optional; send as `X-API-Token` or `?token=` |
| `DATA_DIR` | Catalog + sound files (default `/data` in Docker) |
| `PORT` | HTTP port (default `8787`) |

## Muxshed setup

1. Sources → add **RTMP** → enable **Audio only (soundboard / bed)**.
2. Copy the stream key into Settings → RTMP URL: `rtmp://<host>:1935/live/<key>`.
3. Start RTMP from the soundboard UI (or set URL before boot with `autoStartRtmp`).
4. In Studio audio mixer: **Mix** mode, enable **Duck** on the soundboard strip.

## Demo samples

First boot seeds a small **original** FX pack (UI clicks, rimshot, whoosh, etc.).  
We intentionally do **not** ship audio from the example soundboard repos (Daft Punk stems, meme clips, game/TV bites) — those are copyrighted even when the surrounding code is MIT.

Upload your own clips in the UI for production use.

```bash
npm install
npm run generate-samples
npm run dev
```

- UI: http://127.0.0.1:5173 (proxies API to `:8787`)
- API: http://127.0.0.1:8787/api/health

## Companion (v1)

Use **Generic HTTP**:

| Action | Method | URL |
|--------|--------|-----|
| List | GET | `http://<host>:8787/api/sounds` |
| Play | POST | `http://<host>:8787/api/sounds/<id>/play` |
| Stop | POST | `http://<host>:8787/api/sounds/<id>/stop` |
| Stop all | POST | `http://<host>:8787/api/stop-all` |

If `API_TOKEN` is set, add header `X-API-Token: <token>`.

Body for play (optional JSON): `{ "restart": true, "gain": 1 }`.

## PWA (phone remote)

Serve the UI over **HTTPS** (Access / Tailscale Serve). Install via browser “Add to Home Screen”. Taps call the server play API so on-air RTMP still works without a Stream Deck. Offline: shell may load; on-air play will not.

## WebHID Stream Deck

Chromium only, secure context. Quit the Elgato / Companion Stream Deck connection on that machine first (HID is exclusive). Button index maps to the current filtered pad order.

## API summary

- `GET /api/health` · `GET /api/status` · `GET|PATCH /api/settings`
- `POST /api/rtmp/start` · `POST /api/rtmp/stop`
- `GET|POST /api/sounds` · `PATCH|DELETE /api/sounds/:id`
- `GET /api/sounds/:id/file` · `POST .../play` · `POST .../stop`
- `POST /api/stop-all`
- `WS /ws` — live status / catalog events

## License

MIT
