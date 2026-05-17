# Audit Log

## Cycle 1 — 2026-05-09

Auditor independently verified the user's original request against the code on disk. Quoted bullet items are the user's exact words.

### ✓ Confirmed

- **Monorepo structure** (Fastify+Drizzle+SQLite backend; Vite+React+TS+Tailwind+react-router+TanStack Query web; shared package with Zod schemas) — `package.json`, `pnpm-workspace.yaml`, `apps/backend/`, `apps/web/`, `packages/shared/`.
- **Auth via x-user-id UUID + localStorage**, signup-bonus 100 Photi — `apps/web/src/lib/userId.ts`, `apps/backend/src/middleware/identify.ts`, `apps/backend/src/services/photi.ts`.
- **All six entities (User, Event, Photo, Participant, PhotiTransaction, Job)** with Zod schemas + TS types exported from `packages/shared/src/index.ts` — `packages/shared/src/{user,event,photo,participant,photiTransaction,job}.ts`.
- **DB indexes** `photos(eventId,status)` and `participants(eventId,userId)` — `apps/backend/src/db/schema.ts` lines 69, 89-92.
- **Local storage adapter** with `putObject` + `getSignedUrl` returning `/files/:key` proxy — `apps/backend/src/storage/localAdapter.ts`. Key formats `events/{eventId}/photos/{photoId}/{full|thumb}.{ext}` and `participants/{participantId}/selfie.{ext}` confirmed in routes.
- **All required endpoints** present: `GET /me`, `POST /events`, `GET /events/mine`, `GET /events/:slug`, `PATCH /events/:id`, `POST /events/:id/publish`, `POST /events/:id/archive`, `GET /events/:id/qr`, `POST /events/:id/photos`, `GET /events/:id/photos`, `DELETE /photos/:id`, `PATCH /photos/:id`, `POST /events/:slug/join`, `POST /participants/:id/selfie`, `GET /me/photos`, `GET /events/:id/participants`, `GET /events/:id/foyer-stream`, `GET /events/:slug/foyer-data`, `GET /files/:key`, `GET /billing/packages`, `POST /billing/purchase`, `DELETE /participants/:id` — `apps/backend/src/routes/`.
- **Slug = kebab-case-{6chrandom}** with collision retry — `apps/backend/src/services/slug.ts`.
- **Sharp 400px webp thumbnail + EXIF takenAt** — `apps/backend/src/services/{thumbnail,exif}.ts`.
- **Job queue** (`setInterval(2000)`) processing `process-photo`/`match-selfie`/`retry-awaiting`, with crash recovery — `apps/backend/src/jobs/queue.ts`.
- **Face-api pipeline** (`@vladmandic/face-api` + `tfjs-node`) lazy boot, `scripts/download-models.mjs` fetches the three required nets — `apps/backend/src/services/faceApi.ts` + `apps/backend/scripts/download-models.mjs`.
- **Cosine distance threshold 0.5** + organizer billing 1 Photi/match + `awaiting_credit` branch — `apps/backend/src/services/matching.ts`, `apps/backend/src/jobs/processPhoto.ts`.
- **Reverse selfie matching** in `matchSelfie` — `apps/backend/src/jobs/matchSelfie.ts`.
- **Billing packages 100/₺99, 500/₺449, 2000/₺1499** — `packages/shared/src/billing.ts` lines 12-14.
- **Tailwind brand colors** `#0F1B3D` navy + `#FF6A1A` orange + white background + mobile-first — `apps/web/tailwind.config.ts`.
- **Single API client** with `x-user-id` injected — `apps/web/src/api/client.ts`.
- **Organizer routes** (`/`, `/events/new`, `/events/:id`, `/billing`) and **participant routes** (`/e/:slug`, `/e/:slug/selfie`, `/e/:slug/gallery`, `/e/:slug/foyer`) — `apps/web/src/router.tsx`.
- **Drag-drop upload (parallel 4, retry)** — `apps/web/src/components/Dropzone.tsx`.
- **Photo grid + lightbox + matchCount badge + 'Fuayede Göster' toggle** — `apps/web/src/pages/organizer/tabs/PhotosTab.tsx`.
- **QR PNG download + share-link copy** — `apps/web/src/pages/organizer/tabs/QrTab.tsx`.
- **LowCreditBanner** turuncu uyarı when balance<10 — `apps/web/src/components/LowCreditBanner.tsx` (rendered in `OrganizerLayout`).
- **Selfie page**: getUserMedia preview, capture, upload, ✓ screen, privacy note + 'Verimi sil' — `apps/web/src/pages/participant/Selfie.tsx` lines 172-228.
- **Gallery**: 5s poll (`refetchInterval: 5000`), per-photo download, browser Notification on count delta — `apps/web/src/pages/participant/Gallery.tsx`.
- **Foyer**: 6s rotation (`ROTATION_MS = 6000`), F-key fullscreen toggle, 30s heartbeat watchdog → reload, SSE wiring, live counter footer — `apps/web/src/pages/participant/Foyer.tsx`.
- **Thumbnail webp + `loading="lazy"`** — `apps/web/src/pages/{organizer/tabs/PhotosTab,participant/Gallery}.tsx`.
- **README 3-command setup + Dockerfile + static web build** — `README.md`, `apps/backend/Dockerfile`, `apps/web/package.json` build script.
- **Demo seed script** for the 1-organizer/3-participant/20-photo end-to-end scenario — `apps/backend/scripts/seed-demo.ts`.

### ✗ Gaps

- **NewEvent form is missing the "kapak yükleme" (cover upload) input.** The user explicitly listed `/events/new` fields as "başlık, tarih, kapak yükleme, marka rengi + logo". `apps/web/src/pages/organizer/NewEvent.tsx` only renders title, dates, brand color, and a logo URL field — there is **no** cover input (neither file upload nor URL). `EventLanding` already reads `coverImageUrl` (lines 44-49) and the backend supports `coverImageUrl` via `UpdateEventInput`, but no UI sets it. Result: organizers cannot add a cover image at all from the create form; the `/e/:slug` landing cover block stays permanently empty.
- **Foyer page does not render a QR code in the header.** The user explicitly required for `/e/:slug/foyer`: "üstte logo + QR" (top: logo + QR). `apps/web/src/pages/participant/Foyer.tsx` (lines 122-129) shows only the event title and an "F = tam ekran" hint — there is no `<img>` or component for the QR code, and `Grep` for `QrTab|qrcode|QRCode` inside `Foyer.tsx` returned zero matches. Without a QR on the TV screen, in-room attendees can't scan to join, which is the central UX loop for foyer.

## Cycle 1 — Re-verification — 2026-05-09

Re-ran the audit after the Builder closed tasks A1-1 and A1-2. Verified the previously open gaps are now addressed by independent code reading.

### ✓ Re-verified gap closures

- **A1-1 (cover field) closed.** `apps/web/src/pages/organizer/NewEvent.tsx` lines 19, 49, 102-112 add a `Kapak görseli URL` `<input type="url">` bound to `coverImageUrl` and pass it through to `POST /events`. `packages/shared/src/event.ts` line 30 extends `CreateEventInput` with `coverImageUrl: z.string().url().optional()`. `apps/backend/src/routes/events.ts` line 84 persists it. `SettingsTab.tsx` lines 26, 45, 104-114 also expose the field for later editing. Comment at `NewEvent.tsx` lines 16-18 documents the URL-vs-upload choice — the user's "kapak yükleme" was wizard-delegated between file upload and URL field; URL is shipped end-to-end.
- **A1-2 (foyer QR) closed.** `apps/web/src/pages/participant/Foyer.tsx` lines 31, 51-78, 154-189 now render a 3-column header (`grid grid-cols-3`) with the brand logo on the left, the event title in the middle, and a `<img alt="Etkinlik QR kodu" data-testid="foyer-qr">` fed by a Blob URL fetched from the new public `GET /events/:slug/qr.png` endpoint (no `x-user-id`). The "F = tam ekran" hint is preserved as a fixed footer corner element (line 218-220). Backend wiring: `apps/backend/src/routes/events.ts` lines 229-241 add the slug-based public route with `Cache-Control: public, max-age=60`; `apps/backend/src/middleware/identify.ts` line 32 whitelists the path so it bypasses identity. The pre-existing organizer-only `GET /events/:id/qr` is untouched (line 221).

### ✗ New gaps

None. All user-listed features, endpoints, model fields, design decisions (navy/orange/white Tailwind, x-user-id auth, local storage), and acceptance criteria (3-command README setup, Docker, demo flow) are present in code. Wizard-delegated choices (visual style details, mock-payment UI shape) were not penalised.

**AUDIT_PASS**: User request fully satisfied.

## Cycle 2 — 2026-05-09

Independent re-verification, treating no prior conclusions as authoritative. Re-walked the user's spec point by point against current code on disk.

### ✓ Confirmed (cycle 2)

- **Monorepo layout** — `apps/backend/`, `apps/web/`, `packages/shared/` confirmed via Glob; `apps/backend` uses Fastify (`apps/backend/src/server.ts:1-14`), `better-sqlite3`+Drizzle (`apps/backend/src/db/{client,schema}.ts`); `apps/web` uses Vite/React/TS/Tailwind/react-router/TanStack Query (`apps/web/{vite.config.ts,tailwind.config.ts,src/router.tsx}`).
- **Auth = no auth, x-user-id UUID in localStorage, sent as header on every request** — `apps/web/src/lib/userId.ts:1-28`, `apps/web/src/api/client.ts:36`. Backend creates a User on first sight via `apps/backend/src/middleware/identify.ts:48` → `apps/backend/src/services/photi.ts:12-44`; signup awards exactly 100 Photi (`SIGNUP_BONUS = 100`).
- **All six entities** — `User` (`packages/shared/src/user.ts`), `Event` (`event.ts`, with `id, ownerId, title, slug, coverImageUrl?, startsAt, endsAt, status, brandingColor, brandingLogoUrl?`), `Photo` (`photo.ts`, with `faceVectors` JSON 128-D[], `matchedUserIds` JSON, `isFeatured`, status enum), `Participant` (`participant.ts`, faceVector 128-D), `PhotiTransaction` (`photiTransaction.ts`, type enum), `Job` (`job.ts`). All re-exported from `packages/shared/src/index.ts:4-11`.
- **All endpoints** spec-listed — re-walked each:
  - `GET /me` (`me.ts:22`) returns balance + last 20 transactions (`photi.ts:47-72`).
  - `POST /events` (`events.ts:61`) generates slug `kebab-{6char}` (`slug.ts:50-61`).
  - `GET /events/mine` (`events.ts:101`), `GET /events/:slug` public meta (`events.ts:110`), `PATCH /events/:id` (`events.ts:143`), `POST /events/:id/publish` (`events.ts:174`), `POST /events/:id/archive` (`events.ts:186`).
  - `GET /events/:id/qr` (`events.ts:221`) returns PNG via `qrcode` package (`services/qr.ts`).
  - `POST /events/:id/photos` multipart (`photos.ts:118`) writes thumb webp 400px (`thumbnail.ts`), takes EXIF takenAt (`exif.ts`), inserts photo `status='processing'`, enqueues `process-photo`.
  - `GET /events/:id/photos` paginated with signed URLs (`photos.ts:224`).
  - `DELETE /photos/:id` removes files + row (`photos.ts:268-287`); `PATCH /photos/:id` toggles `isFeatured` (`photos.ts:289-312`).
  - `POST /events/:slug/join` (`participants.ts:30`); `POST /participants/:id/selfie` (`participants.ts:70`); `DELETE /participants/:id` removes selfie + nullifies vector + scrubs matchedUserIds (`participants.ts:145-184`).
  - `GET /me/photos?eventId=X` (`me.ts:24`); `GET /events/:id/participants` (`participants.ts:186`).
  - `GET /events/:id/foyer-stream` SSE (`foyer.ts:100-143`); `GET /events/:slug/foyer-data` public (`foyer.ts:29`).
  - `GET /files/:key` proxy (`files.ts:13`); `GET /billing/packages` (`billing.ts:17`); `POST /billing/purchase` (`billing.ts:19-51`).
- **Storage interface** `putObject(key, buffer)`/`getSignedUrl(key, ttl)` returning `/files/:key` proxy with key formats `events/{eventId}/photos/{photoId}/{full|thumb}.ext` and `participants/{participantId}/selfie.ext` — `storage/localAdapter.ts:29-59`, key shapes used in `routes/photos.ts:161-162` and `routes/participants.ts:131`.
- **Job worker** = jobs table polled with `setInterval(2000)` (`jobs/queue.ts:131-136`); recover on boot (`server.ts:117`). `processPhoto` (a) embeds 128-D vectors via face-api (`processPhoto.ts:36-44`), (b) cosine distance < 0.5 against participants (`matching.ts:7-41`), (c) bills organizer 1 Photi per new match writing `PhotiTransaction type='distribution', amount=-1` (`processPhoto.ts:113-128`), (d) sets `awaiting_credit` and skips matches when balance insufficient (`processPhoto.ts:93-99`), (e) `status='ready'` on success. Selfie reverse-matching mirrors this (`matchSelfie.ts:38-101`); `retryAwaiting` triggered after `POST /billing/purchase` (`billing.ts:49`, `retryAwaiting.ts`).
- **Face-api stack** — `@vladmandic/face-api` + `@tensorflow/tfjs-node` lazy-loaded with the three nets `ssdMobilenetv1` + `faceLandmark68Net` + `faceRecognitionNet` (`faceApi.ts:42-50`). `scripts/download-models.mjs` fetches all three weight pairs (`download-models.mjs:20-30`).
- **Web brand & shell** — Tailwind navy `#0F1B3D` + orange `#FF6A1A` + white bg, mobile-first (`tailwind.config.ts:8-11`, layouts use `bg-white text-brand-navy`).
- **Routes** — organizer `/`, `/events/new`, `/events/:id`, `/billing`; participant `/e/:slug`, `/e/:slug/selfie`, `/e/:slug/gallery`, `/e/:slug/foyer` (`router.tsx:13-32`).
- **Organizer pages** — Home grid (`Home.tsx`); NewEvent has title, datetime start/end, cover URL (line 102-112), brand color, logo URL (`NewEvent.tsx:60-122`); EventDetail tabs (`EventDetail.tsx`): Photos with Dropzone parallel=4 (`Dropzone.tsx:28`), retry (`Dropzone.tsx:55-62`), grid + lightbox (`PhotosTab.tsx`), match count badge + Fuayede göster toggle (`PhotosTab.tsx:122-145`); Participants list with selfie thumb + match count (`ParticipantsTab.tsx`); Settings with edit + Publish/Archive (`SettingsTab.tsx`); QR with PNG download + copy link (`QrTab.tsx`); Billing balance card + 3-package grid + mock card modal that POSTs `packageId` (`Billing.tsx:71-112`).
- **LowCreditBanner** turuncu warning when `balance < 10` shown in `OrganizerLayout` (`OrganizerLayout.tsx:31`, `LowCreditBanner.tsx:8-32`).
- **Participant pages** — EventLanding shows cover + title + Katıl (`EventLanding.tsx:42-69`); Selfie uses `getUserMedia` (`Selfie.tsx:92-95`), live preview, capture-to-canvas, upload, ✓ screen (`Selfie.tsx:143-167`), privacy note (`Selfie.tsx:172-175`), Verimi sil link (`Selfie.tsx:220-228`); Gallery polls every 5s (`Gallery.tsx:38`), per-photo download (`Gallery.tsx:79-100`), Notification permission + delta firing (`Gallery.tsx:44-77`); Foyer 6s rotation (`Foyer.tsx:17`), F-key fullscreen (`Foyer.tsx:128-141`), 30s heartbeat → `location.reload()` (`Foyer.tsx:118-125`), SSE subscription with `EventSource` (`Foyer.tsx:100-115`), header logo + QR (`Foyer.tsx:154-189`), footer counters (`Foyer.tsx:204-217`).
- **Indexes + perf** — `photos_event_status_idx` and `participants_event_user_idx` (`schema.ts:69, 89-92`); thumbs are webp + `<img loading="lazy">` (`PhotosTab.tsx:118`, `Gallery.tsx:128`).
- **README 3-command setup + Dockerfile + web static build** — `README.md:9-13`, `apps/backend/Dockerfile`, web build script in `apps/web/package.json`.
- **End-to-end demo path** — README walks the 1 organizer + 20 photos + 3 participants flow (`README.md:57-89`); plus one-command `pnpm --filter backend run seed:demo` (`README.md:91-103`, `scripts/seed-demo.ts`).

### ✗ Gaps (cycle 2)

None. The user's original spec is satisfied end-to-end. Wizard-delegated items (visual style nuances, mock-payment UI shape, file-vs-URL cover input) and bonus polish (mime allow-list, oversize handling, archive gate, foyer broadcast on photo-removed) are present but not penalised either way.

**AUDIT_PASS**: User request fully satisfied.
