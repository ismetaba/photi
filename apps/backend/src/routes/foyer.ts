import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { StorageAdapter } from "../storage/index.js";
import type { InMemoryFoyerHub, FoyerEvent } from "../sse/foyerHub.js";

export interface FoyerRouteDeps {
  db: AppDb;
  storage: StorageAdapter;
  foyerHub: InMemoryFoyerHub;
  /** Disable the keepalive interval (tests). */
  disableKeepalive?: boolean;
}

const slugParam = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});
const idParam = z.object({ id: z.string().uuid() });

export const foyerRoute: FastifyPluginAsync<FoyerRouteDeps> = async (
  app,
  { db, storage, foyerHub, disableKeepalive },
) => {
  app.get("/events/:slug/foyer-data", async (req, reply) => {
    const parsed = slugParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_slug" });
    const event = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.slug, parsed.data.slug))
      .get();
    if (!event) return reply.code(404).send({ code: "not_found" });

    const featured = db
      .select()
      .from(schema.photos)
      .where(
        and(
          eq(schema.photos.eventId, event.id),
          eq(schema.photos.isFeatured, true),
          eq(schema.photos.status, "ready"),
        ),
      )
      .orderBy(desc(schema.photos.createdAt))
      .all();

    const allPhotos = db
      .select()
      .from(schema.photos)
      .where(
        and(
          eq(schema.photos.eventId, event.id),
          eq(schema.photos.status, "ready"),
        ),
      )
      .all();

    const participants = db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.eventId, event.id))
      .all();

    const distributions = db
      .select()
      .from(schema.photiTransactions)
      .where(
        and(
          eq(schema.photiTransactions.eventId, event.id),
          eq(schema.photiTransactions.type, "distribution"),
        ),
      )
      .all();

    return {
      event: {
        title: event.title,
        slug: event.slug,
        brandingColor: event.brandingColor,
        brandingLogoUrl: event.brandingLogoUrl,
      },
      featured: featured.map((p) => ({
        id: p.id,
        thumbUrl: storage.getSignedUrl(p.thumbKey),
        fullUrl: storage.getSignedUrl(p.storageKey),
      })),
      counts: {
        participants: participants.length,
        photos: allPhotos.length,
        distributions: distributions.length,
      },
    };
  });

  app.get("/events/:id/foyer-stream", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, parsed.data.id))
      .get();
    if (!event) return reply.code(404).send({ code: "not_found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ eventId: event.id })}\n\n`);

    const send = (evt: FoyerEvent) => {
      reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
    };
    const off = foyerHub.subscribe(event.id, send);

    const keepalive = disableKeepalive
      ? null
      : setInterval(() => {
          reply.raw.write(`: keepalive ${Date.now()}\n\n`);
        }, 15_000);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      off();
      if (keepalive) clearInterval(keepalive);
    };
    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
    reply.raw.on("close", cleanup);
    reply.raw.on("error", cleanup);

    // Keep the request alive — Fastify won't auto-close.
    return reply;
  });
};

/** Helper for the photos route to broadcast on featured toggles. */
export function broadcastPhotoFeatured(
  hub: InMemoryFoyerHub,
  eventId: string,
  photoId: string,
  isFeatured: boolean,
): void {
  hub.broadcast({ eventId, type: "photo-featured", photoId, isFeatured });
}
