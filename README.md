# Photi

Photi is a face-recognition photo distribution platform for events. Organizers create
events and upload photos; participants join via QR/link, take a selfie, and instantly
get the photos they appear in. A foyer screen rotates featured photos in real time.

## 3-Command Setup

```bash
pnpm install
pnpm --filter backend run db:migrate
pnpm dev
```

That boots the Fastify backend on `http://localhost:3000` and the Vite web app on
`http://localhost:5173`.

> **Face recognition models.** The first time you run face matching against real
> photos, run `node apps/backend/scripts/download-models.mjs` to fetch the
> `ssd_mobilenetv1` / `face_landmark_68` / `face_recognition` weights into
> `apps/backend/public/models`. You'll also need to install
> `@tensorflow/tfjs-node` and `@vladmandic/face-api` in the backend workspace
> (`pnpm --filter backend add @tensorflow/tfjs-node @vladmandic/face-api`); the
> base scaffolding ships without them so tests don't pull native binaries.

## Workspace layout

```
apps/
  backend/   # Fastify + better-sqlite3 + Drizzle
  web/       # Vite + React 18 + TS + Tailwind
packages/
  shared/    # Zod schemas + TS types reused by both apps
```

## Scripts

| Command                                | What it does                                |
| -------------------------------------- | ------------------------------------------- |
| `pnpm dev`                             | runs backend + web in parallel              |
| `pnpm build`                           | builds all apps                             |
| `pnpm test`                            | runs root vitest (cross-cutting checks)     |
| `pnpm -r test`                         | runs every workspace's vitest suite         |
| `pnpm --filter web test`               | web component + unit tests                  |
| `pnpm --filter backend test`           | backend route + worker tests                |
| `pnpm --filter backend run db:migrate` | (re)apply SQLite migrations                 |
| `pnpm --filter web build`              | static build → `apps/web/dist/`             |

## Branding

- Navy `#0F1B3D`
- Orange `#FF6A1A`
- White background

Per-event organizers can override the primary color via `brandingColor` and a logo URL.

## End-to-End Manual Test (1 organizer + 3 participants + 20 photos)

> Open the project in two terminals (`pnpm dev`) and one or more browsers.

1. **Organizer creates event.** In Browser A (organizer) open
   `http://localhost:5173/`, click **Yeni Etkinlik**, fill in title (e.g. *"Ada'nın
   Doğum Günü"*), the start/end dates, brand color `#FF6A1A`, and submit. You'll
   land on the event detail page with `draft` status.
2. **Upload 20 photos.** Open the **Fotoğraflar** tab and drag-drop ~20 JPEGs into
   the Dropzone. The progress list shows each upload reaching `done` status; the
   grid populates with thumbnails (`processing` → `ready` once the worker runs).
3. **Open the QR for sharing.** Switch to the **QR** tab, copy the share link
   (`http://localhost:5173/e/<slug>`) and download the QR PNG.
4. **Three participants join.** In Browser B/C/D (or three private windows),
   open the share link. Click **Katıl**, then on the selfie page either start the
   webcam or use the file fallback to upload a clear selfie. The "Hazırsın!" screen
   confirms.
5. **Verify gallery distribution.** From each participant's "Galeriyi aç" button,
   open `/e/<slug>/gallery`. Within ~5 s the photos containing that person's face
   appear. Granting Notification permission triggers a system notification on
   subsequent matches.
6. **Toggle Featured + see Foyer.** In Browser A, mark a few photos as **Fuayede
   göster**, then open `/e/<slug>/foyer` on a TV-sized screen. Press `F` for
   fullscreen. The featured images rotate every 6 s; toggling another photo
   pushes it through SSE within seconds.
7. **Top up Photi.** Back in Browser A, open `/billing`. Pick the 500 / ₺449
   package, fill in the mock card and confirm — the balance card jumps and any
   `awaiting_credit` photos resume processing.
8. **Verimi sil flow.** From a participant browser, hit **Verimi sil** on the
   selfie page. The participant's selfie/vector and matched user IDs disappear
   from photos in that event.
9. **Archive.** From the **Ayarlar** tab, click **Arşivle**. The event status
   flips to `archived` and remains read-only.

### One-command demo seed

Skip steps 1–4 above with:

```bash
pnpm --filter backend run seed:demo
```

The script creates the **Photi Demo** event, 20 placeholder photos, and three
synthetic participants who match curated subsets of the photos. It prints the
share link plus the organizer/participant UUIDs so you can paste them into
`localStorage.setItem('photi:userId', '…')` to walk through each role in the
browser. Re-running the script wipes and re-seeds the demo event idempotently.

## Backend Docker

```bash
docker build -t photi-backend -f apps/backend/Dockerfile .
docker run --rm -p 3000:3000 -v photi-data:/data photi-backend
```

The image runs `pnpm db:migrate` on boot, then starts the Fastify server on
port 3000 with persistence under `/data`.
