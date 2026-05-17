/**
 * Demo seed for the Photi end-to-end manual scenario.
 *
 *  - 1 organizer user
 *  - "Photi Demo" event (live)
 *  - 20 generated JPEG "photos" tagged so the face engine returns deterministic
 *    embeddings
 *  - 3 participants with selfies that match a known subset of the photos
 *  - drains the job queue so the data is fully matched & billed
 *
 * Idempotent: re-runs delete the previous Photi Demo event before seeding.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { AppDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import type { StorageAdapter } from "../src/storage/index.js";
import { ensureUserWithSignupBonus, adjustBalance } from "../src/services/photi.js";
import { generateEventSlug } from "../src/services/slug.js";
import { makeThumbnail } from "../src/services/thumbnail.js";
import { enqueueJob } from "../src/jobs/enqueue.js";
import { JobRunner } from "../src/jobs/queue.js";
import { FakeFaceEngine, vector, taggedBuffer } from "../src/testing/fakeFaceEngine.js";
import { FACE_VECTOR_LENGTH } from "@photi/shared";

export const DEMO = {
  organizerId: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  participantIds: [
    "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "33333333-cccc-4ccc-8ccc-cccccccccccc",
    "44444444-dddd-4ddd-8ddd-dddddddddddd",
  ] as const,
  eventTitle: "Photi Demo",
  totalPhotos: 20,
};

export interface SeedDeps {
  db: AppDb;
  storage: StorageAdapter;
  faceEngine: FakeFaceEngine;
}

export interface SeedResult {
  organizerId: string;
  participantIds: string[];
  slug: string;
  photoIds: string[];
}

async function generateJpeg(seed: number): Promise<Buffer> {
  const r = (seed * 37) % 256;
  const g = (seed * 73) % 256;
  const b = (seed * 113) % 256;
  return sharp({
    create: { width: 320, height: 320, channels: 3, background: { r, g, b } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

function participantVector(i: number): number[] {
  // Spread the three demo participants across the 128-D space so they are
  // mutually distant under cosine distance.
  return vector((i + 1) * 17, 1);
}

export async function seedDemo({
  db,
  storage,
  faceEngine,
}: SeedDeps): Promise<SeedResult> {
  // Idempotency: drop any previous Photi Demo event the organizer owns.
  const existing = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.ownerId, DEMO.organizerId))
    .all()
    .filter((e) => e.title === DEMO.eventTitle);
  for (const ev of existing) {
    db.delete(schema.events).where(eq(schema.events.id, ev.id)).run();
  }

  // Make sure the organizer + participants exist with signup bonuses.
  ensureUserWithSignupBonus(db, DEMO.organizerId);
  // Top up organizer to 200 so they can pay for all matches.
  adjustBalance(db, DEMO.organizerId, 100);
  for (const id of DEMO.participantIds) {
    ensureUserWithSignupBonus(db, id);
  }

  const slug = generateEventSlug("Photi Demo", (s) => {
    const found = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.slug, s))
      .get();
    return Boolean(found);
  });
  const eventId = randomUUID();
  const now = new Date();
  db.insert(schema.events)
    .values({
      id: eventId,
      ownerId: DEMO.organizerId,
      title: DEMO.eventTitle,
      slug,
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 4 * 3600_000).toISOString(),
      brandingColor: "#FF6A1A",
      status: "live",
      createdAt: now.toISOString(),
    })
    .run();

  // Distribute 20 photos across the three participants:
  //   - photos 0..7  contain participant 0
  //   - photos 6..13 contain participant 1 (overlap with 0)
  //   - photos 12..19 contain participant 2 (overlap with 1)
  // photo 19 is unmatched (no faces) so we test the awaiting path.
  const ranges = [
    { p: 0, range: [0, 8] as [number, number] },
    { p: 1, range: [6, 14] as [number, number] },
    { p: 2, range: [12, 19] as [number, number] },
  ];

  const photoIds: string[] = [];
  for (let i = 0; i < DEMO.totalPhotos; i++) {
    const photoId = randomUUID();
    photoIds.push(photoId);
    const tag = `photitag:${i}`;
    const matchingVectors: number[][] = ranges
      .filter(({ range }) => i >= range[0] && i < range[1])
      .map(({ p }) => participantVector(p));
    if (matchingVectors.length === 0) {
      // a photo without faces — keep an empty array, no faces detected.
      faceEngine.program(tag, []);
    } else {
      faceEngine.program(tag, matchingVectors);
    }

    const original = await generateJpeg(i + 1);
    const tagged = taggedBuffer(tag, original);
    const fullKey = `events/${eventId}/photos/${photoId}/full.jpg`;
    const thumbKey = `events/${eventId}/photos/${photoId}/thumb.webp`;
    const thumb = await makeThumbnail(tagged);
    await storage.putObject(fullKey, tagged, "image/jpeg");
    await storage.putObject(thumbKey, thumb, "image/webp");

    db.insert(schema.photos)
      .values({
        id: photoId,
        eventId,
        storageKey: fullKey,
        thumbKey,
        faceVectors: "[]",
        matchedUserIds: "[]",
        // First couple photos are featured so the foyer has something to show.
        isFeatured: i < 5,
        status: "processing",
        createdAt: new Date(now.getTime() + i * 1000).toISOString(),
      })
      .run();
    enqueueJob(db, "process-photo", { photoId });
  }

  // Set up participants with selfies tagged so face engine maps to their vectors.
  for (let i = 0; i < DEMO.participantIds.length; i++) {
    const userId = DEMO.participantIds[i]!;
    const participantId = randomUUID();
    const vec = participantVector(i);
    if (vec.length !== FACE_VECTOR_LENGTH) {
      throw new Error("participant vector length mismatch");
    }
    db.insert(schema.participants)
      .values({
        id: participantId,
        eventId,
        userId,
        selfieKey: `participants/${participantId}/selfie.jpg`,
        faceVector: JSON.stringify(vec),
        joinedAt: new Date().toISOString(),
      })
      .run();
    const selfieJpeg = await generateJpeg(i + 100);
    await storage.putObject(
      `participants/${participantId}/selfie.jpg`,
      selfieJpeg,
      "image/jpeg",
    );
    enqueueJob(db, "match-selfie", { participantId });
  }

  // Drain the queue so everything matches before we return.
  const runner = new JobRunner({ db, storage, faceEngine });
  await runner.drain();

  return {
    organizerId: DEMO.organizerId,
    participantIds: [...DEMO.participantIds],
    slug,
    photoIds,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void (async () => {
    const { createDb } = await import("../src/db/client.js");
    const { applyDdl } = await import("../src/db/ddl.js");
    const { LocalAdapter } = await import("../src/storage/localAdapter.js");
    const { env } = await import("../src/env.js");
    const db = createDb({ filename: env.dbPath });
    applyDdl(db.$client);
    const storage = new LocalAdapter({ rootDir: env.storageDir });
    const faceEngine = new FakeFaceEngine();
    const result = await seedDemo({ db, storage, faceEngine });
    db.$client.close();
    // eslint-disable-next-line no-console
    console.log(
      `\n✓ Photi Demo seeded.\n  Share link:    ${env.publicBase.replace(/\/$/, "")}/e/${result.slug}\n  Organizer ID:  ${result.organizerId}\n  Participants:  ${result.participantIds.join(", ")}\n  Photos:        ${result.photoIds.length}\n\nPaste an id into \`localStorage.setItem('photi:userId', '...')\` in the browser to walk the flow.`,
    );
  })();
}
