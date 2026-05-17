import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { StorageAdapter } from "../storage/index.js";
import type { FaceEngine } from "../services/faceApi.js";
import type { FoyerHub } from "../sse/foyerHub.js";
import { isMatch, minDistance } from "../services/matching.js";
import { streamToBuffer } from "../utils/stream.js";

export interface ProcessPhotoDeps {
  db: AppDb;
  storage: StorageAdapter;
  faceEngine: FaceEngine;
  foyerHub?: FoyerHub;
}

export async function processPhoto(
  { db, storage, faceEngine, foyerHub }: ProcessPhotoDeps,
  photoId: string,
): Promise<void> {
  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
  if (!photo) return;

  const event = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, photo.eventId))
    .get();
  if (!event) return;

  // 1) Embed faces in the photo if not already done.
  let faceVectors = JSON.parse(photo.faceVectors) as number[][];
  if (faceVectors.length === 0) {
    const buffer = await streamToBuffer(storage.getStream(photo.storageKey));
    faceVectors = await faceEngine.detectAndEmbed(buffer);
    db.update(schema.photos)
      .set({ faceVectors: JSON.stringify(faceVectors) })
      .where(eq(schema.photos.id, photoId))
      .run();
  }

  // 2) Resolve participants of the event with stored face vectors.
  const participants = db
    .select()
    .from(schema.participants)
    .where(eq(schema.participants.eventId, event.id))
    .all();

  const matchedSet = new Set<string>(
    JSON.parse(photo.matchedUserIds) as string[],
  );

  // Find new matches.
  const newlyMatched: string[] = [];
  for (const p of participants) {
    if (!p.faceVector) continue;
    if (matchedSet.has(p.userId)) continue;
    const vec = JSON.parse(p.faceVector) as number[];
    if (faceVectors.length === 0) continue;
    const d = minDistance(vec, faceVectors);
    if (isMatch(d)) {
      newlyMatched.push(p.userId);
    }
  }

  if (newlyMatched.length === 0) {
    db.update(schema.photos)
      .set({ status: "ready" })
      .where(eq(schema.photos.id, photoId))
      .run();
    foyerHub?.broadcast({
      eventId: event.id,
      type: "photo-ready",
      photoId,
      isFeatured: photo.isFeatured,
    });
    return;
  }

  // 3) Bill the organizer 1 Photi per new match. Insufficient funds → awaiting_credit.
  let becameReady = false;
  db.transaction((tx) => {
    const owner = tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, event.ownerId))
      .get();
    if (!owner || owner.photiBalance < newlyMatched.length) {
      tx.update(schema.photos)
        .set({ status: "awaiting_credit" })
        .where(eq(schema.photos.id, photoId))
        .run();
      return;
    }
    const updatedMatches = [...matchedSet, ...newlyMatched];
    tx.update(schema.photos)
      .set({
        matchedUserIds: JSON.stringify(updatedMatches),
        status: "ready",
      })
      .where(eq(schema.photos.id, photoId))
      .run();
    becameReady = true;
    tx.update(schema.users)
      .set({ photiBalance: owner.photiBalance - newlyMatched.length })
      .where(eq(schema.users.id, owner.id))
      .run();
    const now = new Date().toISOString();
    for (const userId of newlyMatched) {
      tx.insert(schema.photiTransactions)
        .values({
          id: randomUUID(),
          userId: owner.id,
          type: "distribution",
          amount: -1,
          eventId: event.id,
          photoId,
          createdAt: now,
        })
        .run();
      // Distribution destination: not strictly required, kept implicit via matchedUserIds.
      void userId;
    }
  });

  if (becameReady) {
    foyerHub?.broadcast({
      eventId: event.id,
      type: "photo-ready",
      photoId,
      isFeatured: photo.isFeatured,
    });
  }
}
