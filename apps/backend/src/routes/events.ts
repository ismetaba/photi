import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { CreateEventInput, UpdateEventInput } from "@photi/shared";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import { generateEventSlug } from "../services/slug.js";
import { makeQrPng } from "../services/qr.js";
import { env } from "../env.js";

export interface EventsRouteDeps {
  db: AppDb;
}

const PUBLIC_FIELDS = [
  "id",
  "title",
  "slug",
  "coverImageUrl",
  "startsAt",
  "endsAt",
  "status",
  "brandingColor",
  "brandingLogoUrl",
] as const;

type PublicEvent = Pick<
  typeof schema.events.$inferSelect,
  (typeof PUBLIC_FIELDS)[number]
>;

function toPublic(event: typeof schema.events.$inferSelect): PublicEvent {
  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    coverImageUrl: event.coverImageUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    brandingColor: event.brandingColor,
    brandingLogoUrl: event.brandingLogoUrl,
  };
}

const idParam = z.object({
  id: z.string().uuid(),
});
const slugParam = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});

export const eventsRoute: FastifyPluginAsync<EventsRouteDeps> = async (
  app,
  { db },
) => {
  app.post("/events", async (req, reply) => {
    const parsed = CreateEventInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_input", issues: parsed.error.issues });
    }
    const input = parsed.data;
    const slug = generateEventSlug(input.title, (candidate) => {
      const existing = db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(eq(schema.events.slug, candidate))
        .get();
      return Boolean(existing);
    });

    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(schema.events)
      .values({
        id,
        ownerId: req.userId,
        title: input.title,
        slug,
        coverImageUrl: input.coverImageUrl ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        brandingColor: input.brandingColor,
        brandingLogoUrl: input.brandingLogoUrl ?? null,
        status: "draft",
        createdAt: now,
      })
      .run();
    const row = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, id))
      .get()!;
    return reply.code(201).send(row);
  });

  app.get("/events/mine", async (req) => {
    return db
      .select()
      .from(schema.events)
      .where(eq(schema.events.ownerId, req.userId))
      .orderBy(desc(schema.events.createdAt))
      .all();
  });

  app.get("/events/:slug", async (req, reply) => {
    const parsed = slugParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_slug" });
    const row = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.slug, parsed.data.slug))
      .get();
    if (!row) return reply.code(404).send({ code: "not_found" });
    return toPublic(row);
  });

  async function ownerEvent(
    eventId: string,
    userId: string,
    reply: Parameters<Parameters<typeof app.get>[1]>[1],
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
    return event;
  }

  app.patch("/events/:id", async (req, reply) => {
    const idParsed = idParam.safeParse(req.params);
    if (!idParsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = await ownerEvent(idParsed.data.id, req.userId, reply);
    if (!event) return;

    const bodyParsed = UpdateEventInput.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({ code: "invalid_input", issues: bodyParsed.error.issues });
    }
    const patch: Partial<typeof schema.events.$inferInsert> = {};
    const b = bodyParsed.data;
    if (b.title !== undefined) patch.title = b.title;
    if (b.startsAt !== undefined) patch.startsAt = b.startsAt;
    if (b.endsAt !== undefined) patch.endsAt = b.endsAt;
    if (b.brandingColor !== undefined) patch.brandingColor = b.brandingColor;
    if (b.brandingLogoUrl !== undefined) patch.brandingLogoUrl = b.brandingLogoUrl;
    if (b.coverImageUrl !== undefined) patch.coverImageUrl = b.coverImageUrl;
    if (Object.keys(patch).length > 0) {
      db.update(schema.events)
        .set(patch)
        .where(eq(schema.events.id, event.id))
        .run();
    }
    return db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, event.id))
      .get()!;
  });

  app.post("/events/:id/publish", async (req, reply) => {
    const idParsed = idParam.safeParse(req.params);
    if (!idParsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = await ownerEvent(idParsed.data.id, req.userId, reply);
    if (!event) return;
    db.update(schema.events)
      .set({ status: "live" })
      .where(eq(schema.events.id, event.id))
      .run();
    return { ...event, status: "live" as const };
  });

  app.post("/events/:id/archive", async (req, reply) => {
    const idParsed = idParam.safeParse(req.params);
    if (!idParsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = await ownerEvent(idParsed.data.id, req.userId, reply);
    if (!event) return;
    db.update(schema.events)
      .set({ status: "archived" })
      .where(eq(schema.events.id, event.id))
      .run();
    return { ...event, status: "archived" as const };
  });

  // Shared QR responder — used by the organizer-only and the public foyer
  // routes alike. Centralizes the share-URL shape, content-type, and
  // (optionally) caching policy so future callers stay consistent.
  async function sendEventQr(
    reply: Parameters<Parameters<typeof app.get>[1]>[1],
    slug: string,
    opts: { cacheable: boolean; download: boolean },
  ) {
    const url = `${env.publicBase.replace(/\/$/, "")}/e/${slug}`;
    const png = await makeQrPng(url);
    reply.header("content-type", "image/png");
    if (opts.cacheable) {
      reply.header("cache-control", "public, max-age=60");
    }
    if (opts.download) {
      reply.header(
        "content-disposition",
        `inline; filename="${slug}.png"`,
      );
    }
    return reply.send(png);
  }

  app.get("/events/:id/qr", async (req, reply) => {
    const idParsed = idParam.safeParse(req.params);
    if (!idParsed.success) return reply.code(400).send({ code: "invalid_id" });
    const event = await ownerEvent(idParsed.data.id, req.userId, reply);
    if (!event) return;
    return sendEventQr(reply, event.slug, { cacheable: false, download: true });
  });

  // Public, slug-based QR for the unauthenticated foyer page (A1-2).
  // Cached for 60s so the TV doesn't re-render the PNG on every refetch.
  app.get("/events/:slug/qr.png", async (req, reply) => {
    const parsed = slugParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_slug" });
    const event = db
      .select({ slug: schema.events.slug })
      .from(schema.events)
      .where(eq(schema.events.slug, parsed.data.slug))
      .get();
    if (!event) return reply.code(404).send({ code: "not_found" });
    return sendEventQr(reply, event.slug, { cacheable: true, download: false });
  });
};
