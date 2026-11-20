# syntax=docker/dockerfile:1

# ---------- Build the React app ----------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

# ---------- Serve with Caddy (automatic HTTPS, proxies /api to the API) ----------
FROM caddy:2.11-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
