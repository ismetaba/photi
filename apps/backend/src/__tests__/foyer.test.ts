import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine, vector, taggedBuffer } from "../testing/fakeFaceEngine.js";
import { createFoyerHub } from "../sse/foyerHub.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ALICE = "22222222-2222-4222-8222-222222222222";

let app: FastifyInstance;
let fake: FakeFaceEngine;

beforeEach(async () => {
  fake = new FakeFaceEngine();
  app = await buildTestServer({ faceEngine: fake });
});

afterEach(async () => {
  await app.close();
});

async function jpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .jpeg()
    .toBuffer();
}

function multipartBody(
  parts: Array<{ name: string; filename: string; content: Buffer }>,
) {
  const boundary = "----photitestboundary" + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
    );
    chunks.push(p.content);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function happyPathSetup(): Promise<{ eventId: string; slug: string; photoId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/events",
    headers: { "x-user-id": OWNER, "content-type": "application/json" },
    payload: {
      title: "Foyer Test",
      startsAt: "2026-05-09T18:00:00.000Z",
      endsAt: "2026-05-09T22:00:00.000Z",
      brandingColor: "#FF6A1A",
    },
  });
  const event = created.json();

  fake.program("face-a", [vector(0)]);
  const tagged = taggedBuffer("face-a", await jpeg());
  const upload = multipartBody([
    { name: "files", filename: "p.jpg", content: tagged },
  ]);
  const up = await app.inject({
    method: "POST",
    url: `/events/${event.id}/photos`,
    headers: { "x-user-id": OWNER, "content-type": upload.contentType },
    payload: upload.body,
  });
  const photoId = (up.json() as { created: Array<{ id: string }> }).created[0]!.id;

  const join = await app.inject({
    method: "POST",
    url: `/events/${event.slug}/join`,
    headers: { "x-user-id": ALICE },
  });
  const participantId = join.json().id as string;
  const selfie = multipartBody([
    { name: "file", filename: "s.jpg", content: tagged },
  ]);
  await app.inject({
    method: "POST",
    url: `/participants/${participantId}/selfie`,
    headers: { "x-user-id": ALICE, "content-type": selfie.contentType },
    payload: selfie.body,
  });
  await (app as any).photi.runner.drain();

  // Mark the photo as featured.
  await app.inject({
    method: "PATCH",
    url: `/photos/${photoId}`,
    headers: { "x-user-id": OWNER, "content-type": "application/json" },
    payload: { isFeatured: true },
  });

  return { eventId: event.id, slug: event.slug, photoId };
}

describe("FoyerHub", () => {
  it("delivers broadcasts to all subscribers and stops on unsubscribe", () => {
    const hub = createFoyerHub();
    const events1: any[] = [];
    const events2: any[] = [];
    const off1 = hub.subscribe("e1", (e) => events1.push(e));
    hub.subscribe("e1", (e) => events2.push(e));
    hub.broadcast({ eventId: "e1", type: "ping" });
    off1();
    hub.broadcast({ eventId: "e1", type: "photo-featured", photoId: "p", isFeatured: true });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(2);
  });

  it("ignores broadcasts to other events", () => {
    const hub = createFoyerHub();
    const events: any[] = [];
    hub.subscribe("e1", (e) => events.push(e));
    hub.broadcast({ eventId: "e2", type: "ping" });
    expect(events).toHaveLength(0);
  });
});

describe("GET /events/:slug/foyer-data", () => {
  it("is public (no x-user-id) and returns FoyerData with counts", async () => {
    const { slug } = await happyPathSetup();
    const res = await app.inject({
      method: "GET",
      url: `/events/${slug}/foyer-data`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.event.slug).toBe(slug);
    expect(body.event.brandingColor).toBe("#FF6A1A");
    expect(body.featured.length).toBe(1);
    expect(body.featured[0].thumbUrl).toMatch(/^\/files\//);
    expect(body.counts.participants).toBe(1);
    expect(body.counts.photos).toBe(1);
    expect(body.counts.distributions).toBe(1);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/events/no-such-slug-zzzzzz/foyer-data",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /events/:id/foyer-stream", () => {
  it("returns text/event-stream and registers a subscriber", async () => {
    const { eventId } = await happyPathSetup();
    const before = (app as any).photi.foyerHub.count(eventId);

    const responsePromise = app.inject({
      method: "GET",
      url: `/events/${eventId}/foyer-stream`,
      headers: { "x-user-id": OWNER },
      payloadAsStream: true,
    });

    // Wait briefly for the subscription to register.
    await new Promise((r) => setTimeout(r, 30));
    const during = (app as any).photi.foyerHub.count(eventId);
    expect(during).toBe(before + 1);

    const res = (await responsePromise) as any;
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    // Drain so the test process can exit cleanly.
    res.stream().resume();
    res.stream().destroy();
  });
});
