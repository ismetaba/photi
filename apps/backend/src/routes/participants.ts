import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { FACE_VECTOR_LENGTH, isImageMime } from "@photi/shared";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { StorageAdapter } from "../storage/index.js";
import type { FaceEngine } from "../services/faceApi.js";
import { enqueueJob } from "../jobs/enqueue.js";

export interface ParticipantsRouteDeps {
  db: AppDb;
  storage: StorageAdapter;
  faceEngine: FaceEngine;
}

const slugParam = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});
const idParam = z.object({ id: z.string().uuid() });

export const participantsRoute: FastifyPluginAsync<ParticipantsRouteDeps> = async (
  app,
  { db, storage, faceEngine },
) => {
  app.post("/events/:slug/join", async (req, reply) => {
    const parsed = slugParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_slug" });
    const event = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.slug, parsed.data.slug))
      .get();
    if (!event) return reply.code(404).send({ code: "not_found" });

    const existing = db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.eventId, event.id),
          eq(schema.participants.userId, req.userId),
        ),
      )
      .get();
    if (existing) return existing;

    const id = randomUUID();
    db.insert(schema.participants)
      .values({
        id,
        eventId: event.id,
        userId: req.userId,
        selfieKey: null,
        faceVector: null,
        joinedAt: new Date().toISOString(),
      })
      .run();
    return db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.id, id))
      .get()!;
  });

  app.post("/participants/:id/selfie", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_id" });
    const participant = db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.id, parsed.data.id))
      .get();
    if (!participant) return reply.code(404).send({ code: "not_found" });
    if (participant.userId !== req.userId) {
      return reply.code(403).send({ code: "forbidden" });
    }
    if (!req.isMultipart()) {
      return reply.code(415).send({ code: "expected_multipart" });
    }

    let buffer: Buffer | null = null;
    let mimetype = "";
    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          mimetype = part.mimetype ?? "";
          if (!isImageMime(mimetype)) {
            await part.toBuffer().catch(() => undefined);
            return reply.code(415).send({
              code: "unsupported_image_type",
              got: mimetype,
            });
          }
          buffer = await part.toBuffer();
          break;
        }
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ code: "file_too_large" });
      }
      throw err;
    }
    if (!buffer) return reply.code(400).send({ code: "missing_file" });

    const vectors = await faceEngine.detectAndEmbed(buffer);
    if (vectors.length !== 1) {
      return reply.code(422).send({
        code: "face_count",
        detected: vectors.length,
        message:
          vectors.length === 0
            ? "Selfie'de yüz tespit edilemedi"
            : "Selfie'de birden fazla yüz var",
      });
    }
    const vector = vectors[0]!;
    if (vector.length !== FACE_VECTOR_LENGTH) {
      return reply.code(422).send({ code: "bad_vector" });
    }

    // Storage key extension follows the original mimetype so the /files proxy
    // serves the correct content-type.
    const ext = mimetype === "image/png" ? "png" : mimetype === "image/webp" ? "webp" : "jpg";
    const selfieKey = `participants/${participant.id}/selfie.${ext}`;
    await storage.putObject(selfieKey, buffer, mimetype);
    db.update(schema.participants)
      .set({ selfieKey, faceVector: JSON.stringify(vector) })
      .where(eq(schema.participants.id, participant.id))
      .run();
    enqueueJob(db, "match-selfie", { participantId: participant.id });
    return db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.id, participant.id))
      .get()!;
  });

  app.delete("/participants/:id", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_id" });
    const participant = db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.id, parsed.data.id))
      .get();
    if (!participant) return reply.code(404).send({ code: "not_found" });
    if (participant.userId !== req.userId) {
      return reply.code(403).send({ code: "forbidden" });
    }

    if (participant.selfieKey) {
      await storage.remove(participant.selfieKey);
    }

    // Remove user from all matchedUserIds in this event.
    const photos = db
      .select()
      .from(schema.photos)
      .where(eq(schema.photos.eventId, participant.eventId))
      .all();
    db.transaction((tx) => {
      tx.update(schema.participants)
        .set({ selfieKey: null, faceVector: null })
        .where(eq(schema.participants.id, participant.id))
        .run();
      for (const photo of photos) {
        const matched = JSON.parse(photo.matchedUserIds) as string[];
        if (!matched.includes(participant.userId)) continue;
        const next = matched.filter((u) => u !== participant.userId);
        tx.update(schema.photos)
          .set({ matchedUserIds: JSON.stringify(next) })
          .where(eq(schema.photos.id, photo.id))
          .run();
      }
    });
    reply.code(204).send();
  });

  app.get("/events/:id/participants", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, parsed.data.id))
      .get();
    if (!event) return reply.code(404).send({ code: "not_found" });
    if (event.ownerId !== req.userId) {
      return reply.code(403).send({ code: "forbidden" });
    }

    const list = db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.eventId, event.id))
      .all();
    const photos = db
      .select()
      .from(schema.photos)
      .where(eq(schema.photos.eventId, event.id))
      .all();
    return list.map((p) => {
      const matchCount = photos.filter((photo) => {
        const matched = JSON.parse(photo.matchedUserIds) as string[];
        return matched.includes(p.userId);
      }).length;
      return {
        id: p.id,
        userId: p.userId,
        joinedAt: p.joinedAt,
        selfieThumbUrl: p.selfieKey ? storage.getSignedUrl(p.selfieKey) : null,
        matchCount,
      };
    });
  });
};
