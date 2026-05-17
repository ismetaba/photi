import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine, vector, taggedBuffer } from "../testing/fakeFaceEngine.js";

const ORGANIZER = "11111111-1111-4111-8111-111111111111";
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

async function jpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
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

describe("End-to-end happy path", () => {
  it("organizer → participants → distribution → delete-my-data", async () => {
    // 1. Organizer creates + publishes the event.
    const created = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-user-id": ORGANIZER, "content-type": "application/json" },
      payload: {
        title: "Photi Demo",
        startsAt: "2026-05-09T18:00:00.000Z",
        endsAt: "2026-05-09T22:00:00.000Z",
        brandingColor: "#FF6A1A",
      },
    });
    expect(created.statusCode).toBe(201);
    const event = created.json() as { id: string; slug: string };

    const pub = await app.inject({
      method: "POST",
      url: `/events/${event.id}/publish`,
      headers: { "x-user-id": ORGANIZER },
    });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().status).toBe("live");

    // 2. Program face vectors and upload three photos.
    const aliceVec = vector(0);
    const bobVec = vector(64);
    fake.program("aliceFace", [aliceVec]);
    fake.program("bobFace", [bobVec]);

    const uploadOne = async (tag: string) => {
      const tagged = taggedBuffer(tag, await jpeg());
      const { body, contentType } = multipartBody([
        { name: "files", filename: `${tag}.jpg`, content: tagged },
      ]);
      const res = await app.inject({
        method: "POST",
        url: `/events/${event.id}/photos`,
        headers: { "x-user-id": ORGANIZER, "content-type": contentType },
        payload: body,
      });
      expect(res.statusCode).toBe(201);
      return (res.json() as { created: Array<{ id: string }> }).created[0]!.id;
    };
    const photoA1 = await uploadOne("aliceFace");
    const photoA2 = await uploadOne("aliceFace");
    const photoB1 = await uploadOne("bobFace");

    // 3. Two participants join and submit selfies.
    const join = async (user: string) => {
      const r = await app.inject({
        method: "POST",
        url: `/events/${event.slug}/join`,
        headers: { "x-user-id": user },
      });
      expect(r.statusCode).toBe(200);
      return (r.json() as { id: string }).id;
    };
    const aliceParticipantId = await join(ALICE);
    const bobParticipantId = await join(BOB);

    const selfie = async (user: string, participantId: string, tag: string) => {
      const tagged = taggedBuffer(tag, await jpeg());
      const { body, contentType } = multipartBody([
        { name: "file", filename: "selfie.jpg", content: tagged },
      ]);
      const r = await app.inject({
        method: "POST",
        url: `/participants/${participantId}/selfie`,
        headers: { "x-user-id": user, "content-type": contentType },
        payload: body,
      });
      expect(r.statusCode).toBe(200);
    };
    await selfie(ALICE, aliceParticipantId, "aliceFace");
    await selfie(BOB, bobParticipantId, "bobFace");

    // 4. Drain the queue.
    const drained = await (app as any).photi.runner.drain();
    expect(drained).toBeGreaterThanOrEqual(5);

    // 5a. Each participant only sees their own matches.
    const aliceMy = await app.inject({
      method: "GET",
      url: `/me/photos?eventId=${event.id}`,
      headers: { "x-user-id": ALICE },
    });
    const aliceItems = (aliceMy.json() as { items: Array<{ id: string }> }).items;
    expect(aliceItems).toHaveLength(2);
    expect(aliceItems.map((i) => i.id).sort()).toEqual([photoA1, photoA2].sort());

    const bobMy = await app.inject({
      method: "GET",
      url: `/me/photos?eventId=${event.id}`,
      headers: { "x-user-id": BOB },
    });
    const bobItems = (bobMy.json() as { items: Array<{ id: string }> }).items;
    expect(bobItems).toHaveLength(1);
    expect(bobItems[0]!.id).toBe(photoB1);

    // 5b. Organizer balance dropped by exactly 3 (2 for Alice + 1 for Bob).
    const orgMe = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": ORGANIZER },
    });
    expect(orgMe.json().balance).toBe(100 - 3);
    const distribTxns = (orgMe.json().transactions as Array<{ type: string }>)
      .filter((t) => t.type === "distribution");
    expect(distribTxns.length).toBe(3);

    // 5c. All photos ready.
    const photosList = await app.inject({
      method: "GET",
      url: `/events/${event.id}/photos?limit=100`,
      headers: { "x-user-id": ORGANIZER },
    });
    const items = (photosList.json() as { items: Array<{ status: string }> }).items;
    expect(items).toHaveLength(3);
    expect(items.every((p) => p.status === "ready")).toBe(true);

    // 5d. Foyer data has the right counts.
    const foyer = await app.inject({
      method: "GET",
      url: `/events/${event.slug}/foyer-data`,
    });
    expect(foyer.statusCode).toBe(200);
    const fb = foyer.json() as {
      counts: { participants: number; photos: number; distributions: number };
    };
    expect(fb.counts.participants).toBe(2);
    expect(fb.counts.photos).toBe(3);
    expect(fb.counts.distributions).toBe(3);

    // 6. Alice deletes her data — she should be gone from the photos and her selfie file removed.
    const storage = (app as any).photi.storage;
    const selfieKey = `participants/${aliceParticipantId}/selfie.jpg`;
    expect(storage.exists(selfieKey)).toBe(true);

    const del = await app.inject({
      method: "DELETE",
      url: `/participants/${aliceParticipantId}`,
      headers: { "x-user-id": ALICE },
    });
    expect(del.statusCode).toBe(204);
    expect(storage.exists(selfieKey)).toBe(false);

    const after = await app.inject({
      method: "GET",
      url: `/me/photos?eventId=${event.id}`,
      headers: { "x-user-id": ALICE },
    });
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);

    // Bob still sees his match.
    const bobAfter = await app.inject({
      method: "GET",
      url: `/me/photos?eventId=${event.id}`,
      headers: { "x-user-id": BOB },
    });
    expect((bobAfter.json() as { items: unknown[] }).items).toHaveLength(1);
  });
});
