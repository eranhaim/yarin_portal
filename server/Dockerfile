# syntax=docker/dockerfile:1

# Debian (glibc), because the speech runtime (sherpa-onnx) has no musl build.

# ---------- Dependencies ----------
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- Build (TypeScript -> dist/) ----------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Runtime ----------
FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ffmpeg: frames and sound of videos and recordings, and smaller copies of large photos.
RUN apt-get update   && apt-get install -y --no-install-recommends ffmpeg ca-certificates   && rm -rf /var/lib/apt/lists/*
# The Hebrew speech model downloads once (about 72 MB) into this folder, which is a volume.
ENV SPEECH_MODEL_DIR=/models LD_LIBRARY_PATH=/app/node_modules/sherpa-onnx-linux-x64
RUN mkdir /models && chown node:node /models
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Run as the unprivileged "node" user from the base image.
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3   CMD ["node", "-e", "fetch('http://127.0.0.1:4100/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
