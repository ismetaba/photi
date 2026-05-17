# Mimari

## Monorepo Düzeni
```
photi/
├─ package.json                 # workspaces + scripts (dev, build)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ README.md
├─ packages/
│  └─ shared/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts            # tüm Zod şemaları + TS tipleri export
│        ├─ user.ts
│        ├─ event.ts
│        ├─ photo.ts
│        ├─ participant.ts
│        ├─ photiTransaction.ts
│        └─ job.ts
├─ apps/
│  ├─ backend/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ Dockerfile
│  │  ├─ drizzle.config.ts
│  │  ├─ scripts/
│  │  │  └─ download-models.mjs # face-api modellerini public/models'e indirir
│  │  ├─ public/models/         # ssd_mobilenetv1, face_landmark_68, face_recognition
│  │  ├─ storage/               # yerel binary blob klasörü (gitignore)
│  │  └─ src/
│  │     ├─ server.ts           # Fastify init, plugin'ler, listen
│  │     ├─ env.ts              # PORT, DB_PATH, MODEL_DIR
│  │     ├─ db/
│  │     │  ├─ client.ts        # better-sqlite3 + drizzle
│  │     │  ├─ schema.ts        # tüm tablolar + indeksler
│  │     │  └─ migrate.ts       # pnpm db:migrate entrypoint
│  │     ├─ storage/
│  │     │  ├─ index.ts         # interface + factory
│  │     │  └─ localAdapter.ts  # putObject, getSignedUrl, getStream, remove
│  │     ├─ middleware/
│  │     │  └─ identify.ts      # x-user-id header → ensureUser + 100 Photi bonus
│  │     ├─ routes/
│  │     │  ├─ me.ts
│  │     │  ├─ events.ts        # CRUD + publish/archive + qr
│  │     │  ├─ photos.ts        # upload, list, delete, patch, files
│  │     │  ├─ participants.ts  # join, selfie, delete
│  │     │  ├─ foyer.ts         # SSE + foyer-data
│  │     │  ├─ billing.ts       # packages + purchase
│  │     │  └─ files.ts         # /files/:key proxy
│  │     ├─ jobs/
│  │     │  ├─ queue.ts         # setInterval(2000) loop, retry attempts
│  │     │  ├─ processPhoto.ts  # detect + embed + match + bill
│  │     │  └─ matchSelfie.ts   # selfie geliş senaryosu (process-photo'nun tersi)
│  │     ├─ services/
│  │     │  ├─ faceApi.ts       # tfjs-node + @vladmandic/face-api boot, detect/embed
│  │     │  ├─ matching.ts      # cosine distance + eşik
│  │     │  ├─ photi.ts         # bakiye debit/credit, signup bonus
│  │     │  ├─ thumbnail.ts     # sharp 400px webp
│  │     │  ├─ exif.ts          # takenAt çıkarımı
│  │     │  └─ qr.ts            # qrcode PNG
│  │     └─ sse/
│  │        └─ foyerHub.ts      # eventId -> Set<reply> bus
│  └─ web/
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ vite.config.ts
│     ├─ tailwind.config.ts
│     ├─ postcss.config.js
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx              # router + QueryClientProvider + tema
│        ├─ router.tsx
│        ├─ styles.css
│        ├─ api/
│        │  ├─ client.ts         # fetch wrapper, x-user-id otomatik
│        │  ├─ user.ts
│        │  ├─ events.ts
│        │  ├─ photos.ts
│        │  ├─ participants.ts
│        │  ├─ billing.ts
│        │  └─ foyer.ts          # EventSource helper
│        ├─ lib/
│        │  ├─ userId.ts         # localStorage uuid
│        │  ├─ notify.ts         # Notification API wrapper
│        │  ├─ camera.ts         # getUserMedia helper
│        │  └─ format.ts
│        ├─ components/
│        │  ├─ Button.tsx
│        │  ├─ Card.tsx
│        │  ├─ Modal.tsx
│        │  ├─ EmptyState.tsx
│        │  ├─ Lightbox.tsx
│        │  ├─ PhotoGrid.tsx
│        │  ├─ Dropzone.tsx
│        │  ├─ QRBlock.tsx
│        │  ├─ BalanceBadge.tsx
│        │  ├─ LowCreditBanner.tsx
│        │  ├─ Tabs.tsx
│        │  └─ FoyerCarousel.tsx
│        ├─ pages/
│        │  ├─ organizer/
│        │  │  ├─ Home.tsx              # /  (kendi etkinlikleri)
│        │  │  ├─ NewEvent.tsx          # /events/new
│        │  │  ├─ EventDetail.tsx       # /events/:id (sekmeli)
│        │  │  ├─ tabs/
│        │  │  │  ├─ PhotosTab.tsx
│        │  │  │  ├─ ParticipantsTab.tsx
│        │  │  │  ├─ SettingsTab.tsx
│        │  │  │  └─ QrTab.tsx
│        │  │  └─ Billing.tsx           # /billing
│        │  └─ participant/
│        │     ├─ EventLanding.tsx      # /e/:slug
│        │     ├─ Selfie.tsx            # /e/:slug/selfie
│        │     ├─ Gallery.tsx           # /e/:slug/gallery
│        │     └─ Foyer.tsx             # /e/:slug/foyer
│        └─ test/
│           └─ setup.ts                 # vitest + jsdom
```

## Bileşen Ağacı
```
<App>
 ├─ <QueryClientProvider>
 ├─ <RouterProvider>
 │   ├─ OrganizerLayout
 │   │   ├─ TopBar (BalanceBadge, "Yeni Etkinlik")
 │   │   ├─ LowCreditBanner (bakiye<10)
 │   │   ├─ Home / NewEvent / Billing
 │   │   └─ EventDetail
 │   │       └─ Tabs
 │   │           ├─ PhotosTab → Dropzone + PhotoGrid + Lightbox
 │   │           ├─ ParticipantsTab → liste
 │   │           ├─ SettingsTab → form
 │   │           └─ QrTab → QRBlock
 │   └─ ParticipantLayout (mobile, marka rengi)
 │       ├─ EventLanding
 │       ├─ Selfie (Camera)
 │       ├─ Gallery (PhotoGrid + poll + notify)
 │       └─ Foyer (FoyerCarousel + SSE)
```

## State Yönetimi
- **Sunucu durumu:** TanStack Query — `me`, `events`, `eventBySlug`, `photos(eventId)`, `myPhotos(eventId)`, `participants(eventId)`, `billingPackages`, `foyerData(slug)`.
- **İstemci durumu:** UUID → `localStorage` (`photi:userId`); sadece UI lokal state'i (`useState`/`useReducer`) — örn. lightbox, dropzone progress, kamera frame.
- **Realtime:** SSE (`/foyer-stream`) ham `EventSource`; gallery 5 sn poll (`refetchInterval`).
- **Mutation:** Dropzone yükleme paralel 4 + retry (TanStack Mutation queue, basit semaphore).
- **Tema:** Tailwind config `colors.brand.navy=#0F1B3D`, `colors.brand.orange=#FF6A1A`. Etkinlik `brandingColor` CSS değişkeni `--event-color` ile katılımcı sayfalarına override.

## Veri Şekli (TS sketch — `packages/shared/src/index.ts`)
```ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().optional(),
  photiBalance: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const EventStatus = z.enum(['draft', 'live', 'archived']);
export const EventSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1),
  slug: z.string(),
  coverImageUrl: z.string().url().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: EventStatus,
  brandingColor: z.string().regex(/^#([0-9A-Fa-f]{6})$/),
  brandingLogoUrl: z.string().url().optional(),
});
export type Event = z.infer<typeof EventSchema>;

export const PhotoStatus = z.enum(['processing', 'ready', 'awaiting_credit', 'failed']);
export const PhotoSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  storageKey: z.string(),
  thumbKey: z.string(),
  takenAt: z.string().datetime().nullable(),
  faceVectors: z.array(z.array(z.number()).length(128)),  // JSON
  matchedUserIds: z.array(z.string().uuid()),             // JSON
  isFeatured: z.boolean(),
  status: PhotoStatus,
});
export type Photo = z.infer<typeof PhotoSchema>;

export const ParticipantSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  selfieKey: z.string().nullable(),
  faceVector: z.array(z.number()).length(128).nullable(),
  joinedAt: z.string().datetime(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const PhotiTxnType = z.enum(['signup_bonus', 'purchase', 'distribution']);
export const PhotiTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: PhotiTxnType,
  amount: z.number().int(),  // negatif veya pozitif
  eventId: z.string().uuid().optional(),
  photoId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
});
export type PhotiTransaction = z.infer<typeof PhotiTransactionSchema>;

export const JobStatus = z.enum(['queued', 'running', 'done', 'failed']);
export const JobSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['process-photo', 'match-selfie', 'retry-awaiting']),
  payload: z.record(z.unknown()),
  status: JobStatus,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type Job = z.infer<typeof JobSchema>;

// API DTO örnekleri
export const CreateEventInput = EventSchema.pick({
  title: true, startsAt: true, endsAt: true, brandingColor: true,
}).extend({ brandingLogoUrl: z.string().url().optional() });

export const FoyerData = z.object({
  event: EventSchema.pick({ title: true, slug: true, brandingColor: true, brandingLogoUrl: true }),
  featured: z.array(z.object({ id: z.string(), thumbUrl: z.string(), fullUrl: z.string() })),
  counts: z.object({ participants: z.number(), photos: z.number(), distributions: z.number() }),
});
```

## API ↔ UI Akışları (özet)
- **Foto yükleme:** Web → `POST /events/:id/photos` (multipart, paralel 4) → Backend kaydet + Job(`process-photo`) → Worker tfjs ile embed + match + bill → status=`ready`/`awaiting_credit`. UI poll/refetch (`photos(eventId)`).
- **Selfie:** Web → `POST /participants/:id/selfie` → eşleştirme inline (kısa sürer) veya kuyruk; sonuç `me/photos` ile poll edilir.
- **Fuaye:** Public sayfa `foyer-data` ile başlar, `EventSource` ile delta alır. SSE 30sn pingsiz olursa client `location.reload()`.
- **Billing:** `/billing` `GET /me` + `GET /billing/packages` → modal → `POST /billing/purchase` → invalidate `me` + `photos` (awaiting_credit retry tetiklenir).
