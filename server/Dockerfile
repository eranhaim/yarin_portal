# syntax=docker/dockerfile:1

# ---------- Speech recognition (whisper.cpp, static binaries) ----------
# The examiner listens to homework videos. The Hebrew model downloads at run time into a volume.
FROM alpine:3.22 AS speech
RUN apk add --no-cache build-base cmake git
RUN git clone --quiet --depth 1 --branch v1.8.2 https://github.com/ggml-org/whisper.cpp /src
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_EXE_LINKER_FLAGS="-static" -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
      -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
  && cmake --build /build -j 2 --target whisper-cli quantize \
  && strip /build/bin/whisper-cli /build/bin/quantize

# ---------- Dependencies ----------
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- Build (TypeScript -> dist/) ----------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Runtime ----------
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ffmpeg: frames and sound of homework videos, and smaller copies of large photos.
RUN apk add --no-cache ffmpeg
COPY --from=speech /build/bin/whisper-cli /build/bin/quantize /usr/local/bin/
ENV SPEECH_BIN=/usr/local/bin/whisper-cli SPEECH_QUANTIZE_BIN=/usr/local/bin/quantize SPEECH_MODEL_DIR=/models
RUN mkdir /models && chown node:node /models
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Run as the unprivileged "node" user from the base image.
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:4100/api/health || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
