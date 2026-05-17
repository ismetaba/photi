import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine, vector, taggedBuffer } from "../testing/fakeFaceEngine.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ALICE = "22222222-2222-4222-8222-222222222222";
const BOB = "33333333-3333-4333-8333-333333333333";

let app: FastifyInstance;
let fake: FakeFaceEngine;

beforeEach(async () => {
  fake = new FakeFaceEngine();
  app = await buildTestServer({ faceEngine: fake });
});

afterEach(async () => {
  await app.close();
});

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 100, g: 200, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();
}

function multipartBody(parts: Array<{ name: string; filename: string; content: Buffer }>) {
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
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function uploadSelfie(participantId: string, userId: string, tag: string) {
  const jpeg = await makeJpeg();
  const tagged = taggedBuffer(tag, jpeg);
  const { body, contentType } = multipartBody([
    { name: "file", filename: "selfie.jpg", content: tagged },
  ]);
  return app.inject({
    method: "POST",
    url: `/participants/${participantId}/selfie`,
    headers: { "x-user-id": userId, "content-type": contentType },
    payload: body,
  });
}

async function uploadPhotos(eventId: string, tag: string) {
  const jpeg = await makeJpeg();
  const tagged = taggedBuffer(tag, jpeg);
  const { body, contentType } = multipartBody([
    { name: "files", filename: "p.jpg", content: tagged },
  ]);
  return app.inject({
    method: "POST",
    url: `/events/${eventId}/photos`,
    headers: { "x-user-id": OWNER, "content-type": contentType },
    payload: body,
  });
}

async function createEvent(): Promise<{ id: string; slug: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/events",
    headers: { "x-user-id": OWNER, "content-type": "application/json" },
    payload: {
      title: "Bash",
      startsAt: "2026-05-09T18:00:00.000Z",
      endsAt: "2026-05-09T22:00:00.000Z",
      brandingColor: "#FF6A1A",
    },
  });
  return res.json();
}

async function join(slug: string, userId: string) {
  return app.inject({
    method: "POST",
    url: `/events/${slug}/join`,
    headers: { "x-user-id": userId },
  });
}

describe("POST /events/:slug/join", () => {
  it("creates a participant and is idempotent", async () => {
    const event = await createEvent();
    const first = await join(event.slug, ALICE);
    expect(first.statusCode).toBe(200);
    const id1 = first.json().id as string;

    const second = await join(event.slug, ALICE);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(id1);
  });
});

describe("POST /participants/:id/selfie", () => {
  it("rejects 0-face uploads with 422", async () => {
    const event = await createEvent();
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    fake.program("zero", []);
    const res = await uploadSelfie(participantId, ALICE, "zero");
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("face_count");
  });

  it("rejects multi-face uploads with 422", async () => {
    const event = await createEvent();
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    fake.program("multi", [vector(0), vector(1)]);
    const res = await uploadSelfie(participantId, ALICE, "multi");
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("face_count");
  });

  it("stores selfie + vector and queues match-selfie job", async () => {
    const event = await createEvent();
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    fake.program("one", [vector(0)]);
    const res = await uploadSelfie(participantId, ALICE, "one");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.selfieKey).toBe(`participants/${participantId}/selfie.jpg`);
    expect(JSON.parse(body.faceVector).length).toBe(128);

    const jobs = (app as any).photi.db
      .select()
      .from((app as any).photi.schema.jobs)
      .all();
    expect(
      jobs.some((j: any) => j.type === "match-selfie" && j.status === "queued"),
    ).toBe(true);
  });

  it("returns 403 for non-owner", async () => {
    const event = await createEvent();
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    fake.program("one", [vector(0)]);
    const res = await uploadSelfie(participantId, BOB, "one");
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /participants/:id", () => {
  it("clears selfie, vector, and removes user from matchedUserIds in event photos", async () => {
    const event = await createEvent();
    fake.program("one", [vector(0)]);
    // Owner uploads a photo with one face matching Alice.
    await uploadPhotos(event.id, "one");
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    await uploadSelfie(participantId, ALICE, "one");

    // Drain queue to run process-photo + match-selfie.
    const runner = (app as any).photi.runner;
    await runner.drain();

    // Verify Alice is matched in the photo.
    const { db, schema } = (app as any).photi;
    const photo = db.select().from(schema.photos).all()[0];
    expect((JSON.parse(photo.matchedUserIds) as string[]).includes(ALICE)).toBe(true);

    const del = await app.inject({
      method: "DELETE",
      url: `/participants/${participantId}`,
      headers: { "x-user-id": ALICE },
    });
    expect(del.statusCode).toBe(204);

    const refreshed = db.select().from(schema.participants).all()[0];
    expect(refreshed.faceVector).toBeNull();
    expect(refreshed.selfieKey).toBeNull();

    const photoAfter = db.select().from(schema.photos).all()[0];
    expect((JSON.parse(photoAfter.matchedUserIds) as string[]).includes(ALICE)).toBe(false);

    const storage = (app as any).photi.storage;
    expect(storage.exists(`participants/${participantId}/selfie.jpg`)).toBe(false);
  });

  it("403 when not own participant", async () => {
    const event = await createEvent();
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    const del = await app.inject({
      method: "DELETE",
      url: `/participants/${participantId}`,
      headers: { "x-user-id": BOB },
    });
    expect(del.statusCode).toBe(403);
  });
});

describe("GET /me/photos", () => {
  it("returns photos the requesting user is matched in", async () => {
    const event = await createEvent();
    fake.program("one", [vector(0)]);
    await uploadPhotos(event.id, "one");
    const join1 = await join(event.slug, ALICE);
    const participantId = join1.json().id as string;
    await uploadSelfie(participantId, ALICE, "one");
    await (app as any).photi.runner.drain();

    const res = await app.inject({
      method: "GET",
      url: `/me/photos?eventId=${event.id}`,
      headers: { "x-user-id": ALICE },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].fullUrl).toMatch(/^\/files\//);

    const empty = await app.inject({
      method: "GET",
      url: `/me/photos?eventId=${event.id}`,
      headers: { "x-user-id": BOB },
    });
    expect(empty.json().items.length).toBe(0);
  });
});

describe("GET /events/:id/participants", () => {
  it("owner sees the list with thumbs + match count", async () => {
    const event = await createEvent();
    fake.program("one", [vector(0)]);
    await uploadPhotos(event.id, "one");
    const join1 = await join(event.slug, ALICE);
    await uploadSelfie(join1.json().id, ALICE, "one");
    await (app as any).photi.runner.drain();

    const res = await app.inject({
      method: "GET",
      url: `/events/${event.id}/participants`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ userId: string; selfieThumbUrl: string | null; matchCount: number }>;
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(ALICE);
    expect(list[0].selfieThumbUrl).toMatch(/^\/files\//);
    expect(list[0].matchCount).toBe(1);
  });

  it("non-owner is forbidden", async () => {
    const event = await createEvent();
    const res = await app.inject({
      method: "GET",
      url: `/events/${event.id}/participants`,
      headers: { "x-user-id": ALICE },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("billing", () => {
  it("GET /billing/packages returns the three packages", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/billing/packages",
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ id: string; photi: number; priceTl: number }>;
    expect(list.map((p) => p.id).sort()).toEqual(["p100", "p2000", "p500"]);
  });

  it("POST /billing/purchase credits user and queues retry-awaiting", async () => {
    const event = await createEvent();
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { "x-user-id": OWNER, "content-type": "application/json" },
      payload: { packageId: "p500" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balance).toBe(600); // 100 signup + 500 purchase

    const { db, schema } = (app as any).photi;
    const txns = db.select().from(schema.photiTransactions).all();
    expect(
      txns.some(
        (t: any) => t.type === "purchase" && t.amount === 500 && t.userId === OWNER,
      ),
    ).toBe(true);

    const jobs = db.select().from(schema.jobs).all();
    expect(
      jobs.some((j: any) => j.type === "retry-awaiting" && j.status === "queued"),
    ).toBe(true);
    void event;
  });

  it("rejects unknown packageId with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { "x-user-id": OWNER, "content-type": "application/json" },
      payload: { packageId: "ghost" },
    });
    expect(res.statusCode).toBe(400);
  });
});
