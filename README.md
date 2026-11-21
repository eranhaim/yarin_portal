# Yarin Portal

A course portal for a business advisor. Customers sign in and follow their plan on a board-game map: each chapter of the plan is a color group on the board, and each task is a square with videos and files. The advisor manages customers, plans and media in an admin panel.

The whole site is in Hebrew (right-to-left) and uses an original printed board-game look: cream paper, ink outlines, color bands, dice and tokens.

## Features

**Customer area** (`/`)

- Login page with email and password (accounts are created by the admin).
- **Board** (`/map`): a rectangular loop of squares, like a property board game (landscape on wide screens, portrait on phones). The customer's piece is a 3D mascot (three.js + React Three Fiber, loaded lazily, with a 2D token as fallback). Every level (chapter) is a color group that starts with a level square, followed by one square per task. Done tasks get a stamp, locked levels are grey, and the customer's token stands on the next open task. When the customer comes back after completing tasks, the dice roll and the token hops forward.
- **Level** (`/level/:id`): the tasks of the chapter, with due times and status (not started, in progress, completed).
- **Task** (`/level/:id/task/:taskId`): instructions, a custom video player (with a playlist when there are several videos), downloadable files, and **homework upload**: the customer hands in files (up to 5 GB each, straight to the bucket) with an optional note.
- **Library** (`/library`): the plan's guidance videos as a playlist with a side list, and the plan's files.

**Admin panel** (`/admin`)

- **Sign-in**: admin accounts (email + password). `ADMIN_PASSWORD` from `.env` still works as the main password (leave the email empty).
- **Admins** (`/admin/admins`): add, edit and remove admin accounts.
- **Homework inbox** (`/admin/inbox`): every file customers handed in, newest first, with download links. A bell in the top bar shows the unread count (checked every 30 seconds), the tab title shows it too, and admins can turn on browser notifications.

- **Customers**: cards with avatar, contact details, plan and current level. Create and edit customers (name, email, phone, business name, notes, avatar, password, plan), change task status for a customer, see the customer's token on the board.
- **Plans**: create plans with levels (chapters) and tasks (title, instructions, due time). Upload videos and files per task, and a guidance playlist and files for the whole plan. A board shows the tokens of all customers on the plan.

A task title like `שיעור 07 · תוכן כחלק קבוע מהעסק` shows `07` in the square's number badge and the rest as the square label.

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
  src/components/       Board (the board-game map), VideoPlayer, VideoPlaylist, FileList, ...
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
git pull --ff-only && docker compose up -d --build && docker image prune -f --filter label=com.docker.compose.project=yarin-portal
```

The cleanup step removes only the old images of this project (the server is shared with other projects). The server holds no data: the database is MongoDB Atlas and the files are in the storage bucket.

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
