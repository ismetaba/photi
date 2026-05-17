import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { StorageAdapter } from "../storage/index.js";
import { getMeSnapshot } from "../services/photi.js";

export interface MeRouteDeps {
  db: AppDb;
  storage: StorageAdapter;
}

const myPhotosQuery = z.object({
  eventId: z.string().uuid(),
});

export const meRoute: FastifyPluginAsync<MeRouteDeps> = async (
  app,
  { db, storage },
) => {
  app.get("/me", async (req) => getMeSnapshot(db, req.userId));

  app.get("/me/photos", async (req, reply) => {
    const parsed = myPhotosQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_query" });
    }
    const { eventId } = parsed.data;
    const rows = db
      .select()
      .from(schema.photos)
      .where(eq(schema.photos.eventId, eventId))
      .orderBy(desc(schema.photos.createdAt))
      .all();
    const items = rows
      .filter((r) => {
        const matched = JSON.parse(r.matchedUserIds) as string[];
        return matched.includes(req.userId);
      })
      .map((r) => ({
        id: r.id,
        status: r.status,
        isFeatured: r.isFeatured,
        takenAt: r.takenAt,
        fullUrl: storage.getSignedUrl(r.storageKey),
        thumbUrl: storage.getSignedUrl(r.thumbKey),
      }));
    return { items };
  });
};
