# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY . .
RUN npm run build -w client \
  && npm run generate-samples \
  && mkdir -p /seed/sounds \
  && cp data/catalog.json /seed/catalog.json \
  && cp data/sounds/*.mp3 /seed/sounds/

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev
COPY server ./server
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /seed /app/seed
RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /data/sounds
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
