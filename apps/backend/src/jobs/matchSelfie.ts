import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { FoyerHub } from "../sse/foyerHub.js";
import { isMatch, minDistance } from "../services/matching.js";

export interface MatchSelfieDeps {
  db: AppDb;
  foyerHub?: FoyerHub;
}

/**
 * Given a participant whose `faceVector` is already stored, walks every
 * `ready` or `awaiting_credit` photo for that event and adds the participant
 * to `matchedUserIds` where the distance is under threshold. For each new
 * match the organizer is billed 1 Photi (single transaction per photo).
 */
export async function matchSelfie(
  { db, foyerHub }: MatchSelfieDeps,
  participantId: string,
): Promise<void> {
  const participant = db
    .select()
    .from(schema.participants)
    .where(eq(schema.participants.id, participantId))
    .get();
  if (!participant || !participant.faceVector) return;
  const selfieVec = JSON.parse(participant.faceVector) as number[];

  const event = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, participant.eventId))
    .get();
  if (!event) return;

  const photos = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.eventId, event.id))
    .all();

  for (const photo of photos) {
    if (photo.status === "failed" || photo.status === "processing") continue;
    const matchedSet = new Set<string>(
      JSON.parse(photo.matchedUserIds) as string[],
    );
    if (matchedSet.has(participant.userId)) continue;
    const vectors = JSON.parse(photo.faceVectors) as number[][];
    if (vectors.length === 0) continue;
    const d = minDistance(selfieVec, vectors);
    if (!isMatch(d)) continue;

    let becameReady = false;
    db.transaction((tx) => {
      const owner = tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, event.ownerId))
        .get();
      if (!owner || owner.photiBalance < 1) {
        tx.update(schema.photos)
          .set({ status: "awaiting_credit" })
          .where(eq(schema.photos.id, photo.id))
          .run();
        return;
      }
      matchedSet.add(participant.userId);
      tx.update(schema.photos)
        .set({
          matchedUserIds: JSON.stringify([...matchedSet]),
          status: "ready",
        })
        .where(eq(schema.photos.id, photo.id))
        .run();
      becameReady = true;
      tx.update(schema.users)
        .set({ photiBalance: owner.photiBalance - 1 })
        .where(eq(schema.users.id, owner.id))
        .run();
      tx.insert(schema.photiTransactions)
        .values({
          id: randomUUID(),
          userId: owner.id,
          type: "distribution",
          amount: -1,
          eventId: event.id,
          photoId: photo.id,
          createdAt: new Date().toISOString(),
        })
        .run();
    });
    if (becameReady) {
      foyerHub?.broadcast({
        eventId: event.id,
        type: "photo-ready",
        photoId: photo.id,
        isFeatured: photo.isFeatured,
      });
    }
  }
}
