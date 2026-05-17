import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import { enqueueJob } from "./enqueue.js";

export interface RetryAwaitingDeps {
  db: AppDb;
}

/**
 * Re-enqueues `process-photo` for every awaiting_credit photo on events
 * owned by `userId`. Triggered by `POST /billing/purchase` (T08) once the
 * organizer tops up. Foyer `photo-ready` broadcasts emanate from
 * `processPhoto` (T18) when the re-enqueued jobs drain — this function does
 * not broadcast directly so we never double-fire.
 */
export async function retryAwaiting(
  { db }: RetryAwaitingDeps,
  userId: string,
): Promise<void> {
  const events = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.ownerId, userId))
    .all();
  for (const event of events) {
    const stuck = db
      .select()
      .from(schema.photos)
      .where(
        and(
          eq(schema.photos.eventId, event.id),
          eq(schema.photos.status, "awaiting_credit"),
        ),
      )
      .all();
    for (const photo of stuck) {
      // Reset to processing so the worker picks it up.
      db.update(schema.photos)
        .set({ status: "processing" })
        .where(eq(schema.photos.id, photo.id))
        .run();
      enqueueJob(db, "process-photo", { photoId: photo.id });
    }
  }
}
