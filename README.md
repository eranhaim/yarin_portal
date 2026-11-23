# Yarin Portal

A course portal for a business advisor, built as a game. Customers sign in and drive through their plan in a 3D night city: each chapter of the plan is a district, and each task is a mission with the recorded lesson, a worksheet, a quiz and an AI review. Points, skill levels, a prize pyramid and a revenue ladder up to "the boss" (₪100,000 a month) keep them moving. The advisor manages customers, plans, media and the game in an admin panel.

The whole site is in Hebrew (right-to-left). The customer area has an original neon "night city" look (an open-world crime-game feel, with no assets from any real game); the admin panel keeps a printed board-game look.

## Features

**Customer area** (`/`)

- **Login** with email and password (accounts are created by the admin). The two hosts, Yarin and Oren, stand on the login screen as 3D characters dressed as bosses.
- **City** (`/map`): a 3D city (three.js + React Three Fiber, loaded lazily). Districts are the plan's levels, mission markers stand along the road, and the customer's own character walks to the next mission after they finish one. A HUD shows the level, XP, streak, the latest monthly revenue and the next mission.
- **Mission** (`/level/:id/task/:taskId`), in tabs:
  - **Briefing**: the lesson video(s), instructions and files.
  - **Worksheet**: a structured form (text, lists, tables, checklists) that saves as a draft and is handed in once.
  - **Homework upload**: files up to 5 GB each, straight to the bucket.
  - **Quiz**: multiple-choice questions with explanations; points for the best score.
  - **The examiner**: an AI bot reads the worksheet against the task's criteria, gives a score with strengths and fixes, asks follow-up questions, and gives a final score after the customer answers.
- **Skills** (`/skills`): ten skills (numbers, customer, offer, brand, ideas, writing, hooks, camera, sales, mindset) with their own levels, the player level, and how to earn points.
- **Coaches** (`/coach`): a sales simulator (the bot plays a real customer with objections), a script simulator (marketer and copywriter for reels), and a mental coach. The simulators end with a score and feedback.
- **Prizes** (`/rewards`): a prize pyramid (AirPods, studio headphones, lighting kit, camera, a photo-shoot day, a weekend away). Each prize opens by referrals, or by finished levels, all tasks, or monthly revenue. The "bring a friend" card gives a personal invite link. The road to the boss: monthly revenue reports and ranks (טירון, שחקן, יזם, טייקון, מוגול, הבוס).
- **Character** (`/character`): build a character that looks like you, or upload a profile photo and let the AI bot pick the features.
- **Library** (`/library`): the plan's guidance videos as a playlist, the recorded lessons of the open levels, and the plan's files.
- **Invite page** (`/join/:code`, public): a friend leaves their details, and the referrer sees the status in their prizes page.

**Admin panel** (`/admin`)

- **Sign-in**: admin accounts (email + password). `ADMIN_PASSWORD` from `.env` still works as the main password (leave the email empty).
- **Customers**: cards with avatar, contact details, plan and current level. Create and edit customers, change task status, download homework. The customer page also shows the game: level, XP, streak, revenue, skills, prizes (mark a prize as handed over), every worksheet with the AI review and the follow-up chat, quiz scores, coach sessions (full transcript), and the friends they invited.
- **Plans**: levels (chapters) and tasks, with videos and files per task. Each task also has game content: the skill it trains, the worksheet, the quiz and the criteria for the AI review. The AI bot can write all of it from the task (optionally with pasted lesson text); the admin can preview it, write it again, or remove parts.
- **Bring a friend** (`/admin/leads`): the friends that customers invited, with a count of new ones in the top bar. Marking a friend as "joined" gives the referrer 200 points and moves them up the prize pyramid.
- **Characters** (`/admin/hosts`): the looks of Yarin's and Oren's characters, built by hand or from a photo.
- **Homework inbox** (`/admin/inbox`): every file customers handed in, newest first. A bell shows the unread count, and admins can turn on browser notifications.
- **Admins** (`/admin/admins`): add, edit and remove admin accounts.

A task title like `שיעור 07 · תוכן כחלק קבוע מהעסק` shows `07` as the mission number and the rest as its name.

## The game rules

All numbers live in `server/src/game/rules.ts`.

| Action | Points |
|---|---|
| Start a task / finish a task | 10 / 60 |
| Hand in homework / a worksheet | 30 / 40 |
| AI review | up to 120 (by the final score) |
| Quiz | 10 per correct answer (best try counts) |
| Sales or script simulator | up to 80 (by the score) |
| Mental coach session | 15 (once a day) |
| A friend joins | 200 |
| Monthly revenue report / daily visit | 20 / 5 |

Points are idempotent: each action has a key, so doing it again does not pay twice (a better quiz or review score pays the difference). Each skill has 10 levels; the player level grows with the total XP.

## The AI bot

The AI features use Claude through the official Anthropic SDK (`server/src/ai/`): structured JSON output checked with Zod, and a daily limit per customer (`AI_DAILY_LIMIT`). Without `ANTHROPIC_API_KEY`, everything else works and the AI buttons show a short message. The prompts are in `server/src/ai/prompts.ts`.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, React Router 8, Vite 8, TypeScript 7, three.js with React Three Fiber |
| Backend | Node.js 24+ (26 in Docker), Express 5, Mongoose 9, Zod 4, Anthropic SDK |
| Database | MongoDB Atlas in production, MongoDB 9 in Docker for local development |
| File storage | Vultr Object Storage (S3-compatible), private bucket with signed URLs |
| Production | Docker Compose: API and a Caddy web container, behind the server's HTTPS reverse proxy |

## Project structure

```
client/                 React app
  src/components/city/  The 3D city map
  src/components/mascot/  The 3D characters and the character builder
  src/components/       Board, VideoPlayer, VideoPlaylist, FileList, ...
  src/pages/customer/   City, mission (worksheet, quiz, review), skills, coaches, prizes, character, library
  src/pages/admin/      Admin panel pages
  Caddyfile             Production web server config
  Dockerfile
server/                 Express API
  src/models/           Customer, Plan, Asset, Game (points, worksheets, quizzes, coaches, leads, ...)
  src/game/             Game rules, points, worksheet and quiz formats
  src/ai/               Claude client and prompts
  src/routes/           auth, public (hosts, invite page), me/* (customer), admin/*
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

1. Clone the repository and create `.env` next to `compose.yaml` (from `.env.example`). Set at least `MONGO_URI` (MongoDB Atlas), `ADMIN_PASSWORD`, `SESSION_SECRET` and the `S3_*` values, and `ANTHROPIC_API_KEY` for the AI features.
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
- Never commit `.env`. It holds the storage keys, the AI key and all passwords.
- The AI bot gets only what the customer wrote (and, for "character from photo", their profile photo). Each customer has a daily limit of AI requests.
