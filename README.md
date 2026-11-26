# Yarin Portal

A business-growth simulator for a mentoring program. Customers learn from recorded lessons, practice on their own business, hand in real work, get feedback, improve it, and see two things grow apart: their learning and their business. The mentors manage customers, plans, media and the AI coaches in an admin panel.

The whole site is in Hebrew (right-to-left).

## The idea

- **One clear task at any moment.** The server computes the one thing to do now (`server/src/game/flow.ts`) and every screen points to it.
- **A personal route.** A first diagnosis decides the track (solo service, local business, products, sales team), the stage and the bottleneck (`server/src/game/tracks.ts`). Everybody shares the base; later tasks differ by track. An admin can change the route.
- **A closed learning loop.** Watch → quiz → practice → files → check → fix → the next version. A task closes by itself when its steps are done. After two checked versions nobody gets stuck. Yarin and Oren's decision always wins over the AI.
- **Two metrics that never mix.** Learning (XP, levels, skills) and business (leads, sales calls, customers, income, profit, month by month).
- **Coaches with a release gate.** A coach meets customers only after its exact version passes a fixed set of tests.

## Customer area

- **Now** (`/map`): a 3D coastal city (three.js + React Three Fiber, loaded lazily). The customer's car (a detailed concept car) waits before the current mission and drives there from the last one; the customer stands beside it, and Yarin or Oren waits at the mission. Only the part of the avenue around the drive is built (about 110 m behind and 320 m ahead); fog hides the rest. The camera stays behind or beside the car, never above it. A small navigation map shows the way; the full map shows all districts and missions, and stands in for the street when the device has no WebGL. The picture lowers its quality by itself on slow devices.
- **Task** (`/level/:id/task/:taskId`): a path of steps. The video counts only the parts that were really watched, resumes, and has captions. Worksheets keep every version, the examiner answers criterion by criterion with quotes, and files (video, PDF, Word, slides, pictures) are opened and checked.
- **Learning** (`/learning`) and **Business** (`/business`): the two metrics. A business report takes one minute a month.
- **Coaches** (`/coach`):
  - **Sales simulator**: a role play with a hidden client, written or as a voice call; a check of a real conversation (an uploaded or recorded call, a screenshot or text) with times, voices and a score; an objection drill.
  - **The marketer**: hooks, messages, scripts, a content plan, a check of real work, a hook drill, and any question about the whole process.
  - **Mental coach**: a short talk that ends with one small step.
  - Every coach knows the customer's business file, remembers what was agreed (the customer can see and delete it), and takes dictated messages.
- **Character** (`/character`): the customer picks one of 20 realistic people (rigged, with motion-captured moves) and dresses them: a suit, a buttoned shirt or a T-shirt in a chosen color, or their own clothes; glasses, a gold chain, and a briefcase, a phone or a coffee. Claude can pick the closest person from a profile photo.
- **Prizes** (`/rewards`), **library** (`/library`, all lessons) and the public invite page (`/join/:code`).

## Admin panel (`/admin`)

- **Customers**: progress, route, both metrics, every version of every work, coach sessions, prizes.
- **Works**: the review queue. Approve, return with notes, or leave it to the examiner.
- **Plans**: levels and tasks, videos and files; per task: the skill, who it is for (track, stage), rules, worksheet, quiz, review criteria, and what the lesson teaches. The AI can write all of it.
- **The brain** (`/admin/brain`): everything the coaches know. Text, documents, slides and recordings (also recorded on the spot) become teaching notes that the admins can edit, per coach.
- **Coaches** (`/admin/lab`): the fixed tests, their results and the release to customers.
- **Bring a friend**, **characters**, **admins**.

A task title like `שיעור 07 · תוכן כחלק קבוע מהעסק` shows `07` as the mission number. `מסלול אישי · …` marks a task of a personal route.

## The AI

Claude through the official Anthropic SDK (`server/src/ai/`): structured output checked with Zod, prompt caching, and a daily limit per customer (`AI_DAILY_LIMIT`).

| File | What it does |
|---|---|
| `coaches.ts`, `prompts.ts` | The coaches, the examiner, and their professional playbooks |
| `knowledge.ts`, `lessonNotes.ts`, `learn.ts` | Yarin and Oren's method: lesson notes, and the brain |
| `businessFile.ts` | What a coach may know about one customer |
| `files.ts`, `media.ts` | Opens real work: pictures, PDF, Office files, video frames, speech |
| `speech.ts`, `speechWorker.ts` | Hebrew speech to text, and telling voices apart |
| `lab/`, `release.ts` | The fixed tests and the release gate |
| `caretaker.ts` | Writes notes from new transcripts, tests changed coaches, and resumes after an outage |

- A version of a coach = its prompts, the model, the tests and its knowledge. It opens at 85% and no failure of a critical test. A change of the prompts closes it until it passes again. A change of the knowledge does not: customers keep the knowledge that passed until the new one does.
- Without credit or a working key the coaches pause, work goes to people, admins see why, and everything resumes by itself.
- Speech runs on the server (sherpa-onnx): a Hebrew streaming Zipformer by Yakov Kolani, published by ivrit.ai (CC BY 4.0); pyannote segmentation 3.0 (MIT) and 3D-Speaker CAM++ (Apache 2.0) tell voices apart. A minute of a call takes about 20 seconds on a small server.

## The game rules

All numbers live in `server/src/game/rules.ts`. Points are for learning only; income and referrals open prizes and ranks, and never give XP. Points are idempotent: each action has a key, so doing it again does not pay twice (a better quiz or review pays the difference).

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, React Router 8, Vite 8, TypeScript 7, three.js with React Three Fiber and postprocessing |
| Backend | Node.js 24+ (26 in Docker), Express 5, Mongoose 9, Zod 4, Anthropic SDK, ffmpeg, sherpa-onnx |
| Database | MongoDB Atlas in production, MongoDB 9 in Docker for local development |
| File storage | Vultr Object Storage (S3-compatible), private bucket with signed URLs |
| Production | Docker Compose: API and a Caddy web container, behind the server's HTTPS reverse proxy |

City textures and the sky are CC0 (ambientCG, Poly Haven); see `client/src/assets/city/LICENSE.md`. The people are from the Microsoft Rocketbox Avatar Library (MIT), converted by avatar-studio (MIT); see `client/public/people/LICENSE.md`. The car is "Car Concept" by Eric Chadwick / Darmstadt Graphics Group (CC BY 4.0); see `client/public/car/LICENSE.md`.

## Project structure

```
client/                 React app
  src/components/city/  The 3D city, the navigation map and the fallback
  src/components/person/  The realistic people: models, clothes, extras (glasses, chain, things to hold)
  src/components/mascot/  The small 3D scenes with people, and the character builder
  public/people/, public/car/  The 3D models (glTF, meshopt-compressed) and their licenses
  src/pages/customer/   City, task (mission/), learning, business, coaches, voice call, prizes, library
  src/pages/admin/      Admin panel pages
  src/lib/voice.ts      Recording, dictation and reading aloud
  Caddyfile             Production web server config
server/                 Express API
  src/models/           Customer, Plan, Asset, Submission, Game (everything else)
  src/game/             Flow and focus, routes, business numbers, rules, points, worksheet and quiz formats
  src/ai/               Claude, coaches, the brain, files, speech, the lab
  src/routes/           auth, public, me/* (customer), admin/*
  scripts/bucket-cors.ts  Allows browser uploads to the bucket from a site origin
compose.yaml            Production stack (API + Caddy)
compose.dev.yaml        MongoDB for local development
.env.example            All settings, with comments
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

The cleanup step removes only the old images of this project (the server is shared with other projects). The server holds no data: the database is MongoDB Atlas and the files are in the storage bucket. The volume `speech-model` only keeps the speech models, which download again when they are missing.

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
- The AI gets only what the customer wrote and the files they handed in (and, for "character from photo", their profile photo). Recordings are transcribed on the server. Everything is deleted with the customer.
- ffmpeg reads customers' files with a list of allowed protocols and formats, so a "video" that is really a playlist cannot open other addresses.
