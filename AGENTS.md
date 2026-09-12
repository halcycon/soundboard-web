# Web Soundboard

Docker service colocated with muxshed. See [README.md](README.md).

- Server mixes audio and publishes AAC RTMP (`audio_only` muxshed source).
- Browser / PWA / Companion HTTP are control surfaces.
- Deploy via root [`compose.yaml`](compose.yaml) (`docker compose up --build -d` or Arcane Git Sync → `compose.yaml`).
- Do not commit secrets or live stream keys.
