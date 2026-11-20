# Yarin Portal

A course portal for a business advisor. Customers sign in and follow their plan on a game-style map: each chapter of the plan is a level, and each level has tasks with videos and files. The advisor manages customers, plans and media in an admin panel.

## Features

**Customer area** (`/`)

- Login page with email and password (accounts are created by the admin).
- **Map** (`/map`): a game-style trail where every chapter is a level. Completed levels get a star, the current level glows, later levels stay locked until the level before them is complete. The customer's avatar walks to the next level when a level is complete.
- **Level** (`/level/:id`): the tasks of the chapter, with due times and status (not started, in progress, completed).
- **Task** (`/level/:id/task/:taskId`): instructions, a custom video player (with a playlist when there are several videos), and downloadable files.
- **Library** (`/library`): the plan's guidance videos as a playlist with a side list, and the plan's files.

**Admin panel** (`/admin`, password from `ADMIN_PASSWORD`)

- **Customers**: cards with avatar, contact details, plan and current level. Create and edit customers (name, email, phone, business name, notes, avatar, password, plan), change task status for a customer, see the customer's position on the map.
- **Plans**: create plans with levels (chapters) and tasks (title, instructions, due time). Upload videos and files per task, and a guidance playlist and files for the whole plan. A map shows where every customer on the plan is.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, React Router 8, Vite 8, TypeScript 7 |
| Backend | Node.js 24+ (26 in Docker), Express 5, Mongoose 9, Zod 4 |
| Database | MongoDB Atlas in production, MongoDB 9 in Docker for local development |
| File storage | Vultr Object Storage (S3-compatible), private bucket with signed URLs |
| Production | Docker Compose: API and a Caddy web container, behind the server's HTTPS reverse proxy |

## Project structure

```
client/                 React app
  src/components/       GameMap, VideoPlayer, VideoPlaylist, FileList, ...
  src/pages/customer/   Map, level, task and library pages
  src/pages/admin/      Admin panel pages
  Caddyfile             Production web server config
  Dockerfile
server/                 Express API
  src/models/           Customer, Plan, Asset (Mongoose)
  src/routes/           auth, me (customer), admin/*
  scripts/bucket-cors.ts  Allows browser uploads to the bucket from a site origin
  Dockerfile
compose.yaml            Production stack (API + Caddy)
compose.dev.yaml        MongoDB for local development
.env.example            All settings, with comments
.env                    Local settings (not in Git)
.env.production         Production settings, copied to the server as .env (not in Git)
```

## Local development

Requirements: Node.js 24 or later, Docker.

1. Copy the settings file and fill in the values:
   ```sh
   cp .env.example .env
   ```
2. Start MongoDB (port 27018, so it does not clash with a local MongoDB):
   ```sh
   docker compose -f compose.dev.yaml up -d
   ```
3. Install and start the API (port 4100):
   ```sh
   cd server
   npm install
   npm run dev
   ```
4. In a second terminal, install and start the React app (port 5173):
   ```sh
   cd client
   npm install
   npm run dev
   ```
5. Allow browser uploads to the bucket from the dev site (one time):
   ```sh
   cd server
   node --env-file=../.env scripts/bucket-cors.ts http://localhost:5173
   ```

Open http://localhost:5173 for the customer area and http://localhost:5173/admin for the admin panel.

## How uploads work

Videos and files go straight from the browser to the bucket, so large videos never pass through the API server:

1. The admin panel asks the API for a signed upload URL.
2. The browser uploads the file to the bucket (with a progress bar).
3. For videos, the browser also sends a preview image and the duration.
4. The API checks that the file exists and marks it as ready.

The bucket stays private. Customers get signed links that expire after 1–2 hours. MP4 (H.264) videos play in every browser. The maximum size is 5 GB per file.

## Production (Docker)

The production server already runs a reverse proxy (Caddy) on ports 80/443 for several sites. This project does not touch those ports: the web container listens on `127.0.0.1:8096` (`WEB_PORT`), and the host's Caddy serves the public domain over HTTPS and forwards to it.

```
browser --HTTPS--> host Caddy (:443) --> web container (127.0.0.1:8096) --/api--> api container
```

First setup on the server:

1. Clone the repository and create `.env` next to `compose.yaml` (from `.env.example`). Set at least `MONGO_URI` (MongoDB Atlas), `ADMIN_PASSWORD`, `SESSION_SECRET` and the `S3_*` values.
2. In MongoDB Atlas, open **Network Access** and allow the server's IP address.
3. Start the stack:
   ```sh
   docker compose up -d --build
   ```
4. Add a site block to the host's `/etc/caddy/Caddyfile` (back up the file first), then validate and reload:
   ```
   your-domain.example {
   	reverse_proxy 127.0.0.1:8096
   }
   ```
   ```sh
   caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
   ```
5. Allow browser uploads from the public address (one time, from a machine with Node.js and the `.env`):
   ```sh
   cd server
   node --env-file=../.env scripts/bucket-cors.ts https://your-domain.example
   ```

Deploy a new version (on the server, in the project folder):

```sh
git pull --ff-only && docker compose up -d --build && docker image prune -f
```

The server holds no data: the database is MongoDB Atlas and the files are in the storage bucket.

Useful commands:

```sh
docker compose ps                 # status and health
docker compose logs -f api        # API logs
```

## Security notes

- `ADMIN_PASSWORD` is the only key to the admin panel. Changing it signs out all admin sessions.
- Login attempts are rate limited (10 failed attempts per 15 minutes per IP address).
- Sessions are signed, `HttpOnly` cookies (`Secure` in production).
- Never commit `.env`. It holds the storage keys and all passwords.
