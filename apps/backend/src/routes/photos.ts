import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import path from "node:path";
import { isImageMime, type PhotoUploadRejection } from "@photi/shared";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { StorageAdapter } from "../storage/index.js";
import { makeThumbnail } from "../services/thumbnail.js";
import { extractTakenAt } from "../services/exif.js";
import { enqueueJob } from "../jobs/enqueue.js";
import type { FoyerHub } from "../sse/foyerHub.js";

export interface PhotosRouteDeps {
  db: AppDb;
  storage: StorageAdapter;
  foyerHub: FoyerHub;
}

const idParam = z.object({ id: z.string().uuid() });
const photoIdParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
const patchBody = z.object({
  isFeatured: z.boolean(),
});

function extOf(filename: string | undefined): string {
  if (!filename) return "jpg";
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext.length > 0 && ext.length <= 5 ? ext : "jpg";
}

function publicItem(
  row: typeof schema.photos.$inferSelect,
  storage: StorageAdapter,
) {
  const matchedUserIds = JSON.parse(row.matchedUserIds) as string[];
  return {
    id: row.id,
    status: row.status,
    isFeatured: row.isFeatured,
    takenAt: row.takenAt,
    fullUrl: storage.getSignedUrl(row.storageKey),
    thumbUrl: storage.getSignedUrl(row.thumbKey),
    matchCount: matchedUserIds.length,
  };
}

async function ownerEvent(
  db: AppDb,
  eventId: string,
  userId: string,
  reply: FastifyReply,
  opts: { blockArchived?: boolean } = {},
) {
  const event = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .get();
  if (!event) {
    reply.code(404).send({ code: "not_found" });
    return null;
  }
  if (event.ownerId !== userId) {
    reply.code(403).send({ code: "forbidden" });
    return null;
  }
  // Archived events are terminal for write paths (upload). Reads stay open
  // so participants can still browse the event after it's closed.
  if (opts.blockArchived && event.status === "archived") {
    reply.code(409).send({ code: "event_archived" });
    return null;
  }
  return event;
}

async function ownerPhoto(
  db: AppDb,
  photoId: string,
  userId: string,
  reply: FastifyReply,
) {
  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
  if (!photo) {
    reply.code(404).send({ code: "not_found" });
    return null;
  }
  const event = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, photo.eventId))
    .get();
  if (!event || event.ownerId !== userId) {
    reply.code(403).send({ code: "forbidden" });
    return null;
  }
  // Same archive gate as ownerEvent — keeps PATCH/DELETE consistent with upload.
  if (event.status === "archived") {
    reply.code(409).send({ code: "event_archived" });
    return null;
  }
  return { photo, event };
}

export const photosRoute: FastifyPluginAsync<PhotosRouteDeps> = async (
  app,
  { db, storage, foyerHub },
) => {
  app.post("/events/:id/photos", async (req: FastifyRequest, reply) => {
    const idParsed = idParam.safeParse(req.params);
    if (!idParsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = await ownerEvent(db, idParsed.data.id, req.userId, reply, {
      blockArchived: true,
    });
    if (!event) return;

    if (!req.isMultipart()) {
      return reply
        .code(415)
        .send({ code: "expected_multipart" });
    }

    const created: ReturnType<typeof publicItem>[] = [];
    const rejected: PhotoUploadRejection[] = [];
    const rejectedTooLarge: Array<{ filename: string | null }> = [];
    let lastFilename: string | null = null;
    try {
    for await (const part of req.parts()) {
      if (part.type !== "file") continue;
      const filename = part.filename ?? null;
      lastFilename = filename;
      const mimetype = part.mimetype ?? "";
      if (!isImageMime(mimetype)) {
        rejected.push({ filename, mimetype });
        // Drain the part so multipart parsing continues.
        await part.toBuffer().catch(() => undefined);
        continue;
      }
      const ext = extOf(filename ?? undefined);
      let buffer: Buffer;
      try {
        buffer = await part.toBuffer();
      } catch (err) {
        const code = (err as { code?: string }).code ?? "";
        if (code === "FST_REQ_FILE_TOO_LARGE") {
          rejectedTooLarge.push({ filename });
          continue;
        }
        throw err;
      }
      const photoId = randomUUID();
      const fullKey = `events/${event.id}/photos/${photoId}/full.${ext}`;
      const thumbKey = `events/${event.id}/photos/${photoId}/thumb.webp`;

      let thumb: Buffer;
      try {
        thumb = await makeThumbnail(buffer, { maxWidth: 400 });
      } catch {
        rejected.push({ filename, mimetype });
        continue;
      }
      const takenAt = await extractTakenAt(buffer);

      await storage.putObject(fullKey, buffer, mimetype);
      await storage.putObject(thumbKey, thumb, "image/webp");

      const now = new Date().toISOString();
      db.insert(schema.photos)
        .values({
          id: photoId,
          eventId: event.id,
          storageKey: fullKey,
          thumbKey,
          takenAt,
          faceVectors: "[]",
          matchedUserIds: "[]",
          isFeatured: false,
          status: "processing",
          createdAt: now,
        })
        .run();
      enqueueJob(db, "process-photo", { photoId });
      const row = db
        .select()
        .from(schema.photos)
        .where(eq(schema.photos.id, photoId))
        .get()!;
      created.push(publicItem(row, storage));
    }

    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        rejectedTooLarge.push({ filename: lastFilename });
      } else {
        throw err;
      }
    }

    if (created.length === 0) {
      // Distinguish "everything was too big" from "everything was wrong type"
      // for clients that want to render different copy.
      if (rejectedTooLarge.length > 0 && rejected.length === 0) {
        return reply
          .code(413)
          .send({ code: "file_too_large", rejectedTooLarge });
      }
      return reply
        .code(415)
        .send({ code: "no_supported_images", rejected, rejectedTooLarge });
    }
    return reply.code(201).send({ created, rejected, rejectedTooLarge });
  });

  app.get("/events/:id/photos", async (req, reply) => {
    const idParsed = idParam.safeParse(req.params);
    if (!idParsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = await ownerEvent(db, idParsed.data.id, req.userId, reply);
    if (!event) return;
    const queryParsed = listQuery.safeParse(req.query);
    if (!queryParsed.success) return reply.code(400).send({ code: "invalid_query" });
    const { cursor, limit } = queryParsed.data;

    // Cursor encodes `${createdAt}|${id}` for stable ordering newest-first.
    // Tuple comparison: createdAt < cAt OR (createdAt = cAt AND id < cId).
    let cursorWhere: SQL | undefined;
    if (cursor) {
      const [cAt, cId] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
      if (cAt && cId) {
        cursorWhere = or(
          lt(schema.photos.createdAt, cAt),
          and(eq(schema.photos.createdAt, cAt), lt(schema.photos.id, cId)),
        );
      }
    }

    const where = cursorWhere
      ? and(eq(schema.photos.eventId, event.id), cursorWhere)
      : eq(schema.photos.eventId, event.id);

    const rows = db
      .select()
      .from(schema.photos)
      .where(where)
      .orderBy(desc(schema.photos.createdAt), desc(schema.photos.id))
      .limit(limit + 1)
      .all();

    const items = rows.slice(0, limit).map((r) => publicItem(r, storage));
    const hasMore = rows.length > limit;
    const last = rows[limit - 1] ?? null;
    const nextCursor =
      hasMore && last
        ? Buffer.from(`${last.createdAt}|${last.id}`, "utf8").toString("base64url")
        : null;
    return { items, nextCursor };
  });

  app.delete("/photos/:id", async (req, reply) => {
    const parsed = photoIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_id" });
    const owned = await ownerPhoto(db, parsed.data.id, req.userId, reply);
    if (!owned) return;
    const { photo } = owned;
    await storage.remove(photo.storageKey);
    await storage.remove(photo.thumbKey);
    db.delete(schema.photos).where(eq(schema.photos.id, photo.id)).run();
    // Only notify the foyer when the carousel actually had this photo on
    // screen (featured + ready) — keeps SSE chatter tight.
    if (photo.isFeatured && photo.status === "ready") {
      foyerHub.broadcast({
        eventId: photo.eventId,
        type: "photo-removed",
        photoId: photo.id,
      });
    }
    reply.code(204).send();
  });

  app.patch("/photos/:id", async (req, reply) => {
    const parsed = photoIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_id" });
    const bodyParsed = patchBody.safeParse(req.body);
    if (!bodyParsed.success)
      return reply.code(400).send({ code: "invalid_input" });
    const owned = await ownerPhoto(db, parsed.data.id, req.userId, reply);
    if (!owned) return;
    const { photo } = owned;
    db.update(schema.photos)
      .set({ isFeatured: bodyParsed.data.isFeatured })
      .where(eq(schema.photos.id, photo.id))
      .run();
    foyerHub.broadcast({
      eventId: photo.eventId,
      type: "photo-featured",
      photoId: photo.id,
      isFeatured: bodyParsed.data.isFeatured,
    });
    return {
      ...photo,
      isFeatured: bodyParsed.data.isFeatured,
    };
  });
};
