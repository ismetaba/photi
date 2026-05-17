import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine } from "../testing/fakeFaceEngine.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ALICE = "22222222-2222-4222-8222-222222222222";

let app: FastifyInstance;
let fake: FakeFaceEngine;

beforeEach(async () => {
  fake = new FakeFaceEngine();
  app = await buildTestServer({
    faceEngine: fake,
    multipartLimitBytes: 64,
  });
});

afterEach(async () => {
  await app.close();
});

async function makeJpeg(): Promise<Buffer> {
  // ~700 bytes when encoded.
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();
}

interface PartSpec {
  name: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

function multipartBody(parts: PartSpec[]) {
  const boundary = "----photitestboundary" + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.contentType}\r\n\r\n`,
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

async function createEvent(): Promise<{ id: string; slug: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/events",
    headers: { "x-user-id": OWNER, "content-type": "application/json" },
    payload: {
      title: "Oversize Test",
      startsAt: "2026-05-09T18:00:00.000Z",
      endsAt: "2026-05-09T22:00:00.000Z",
      brandingColor: "#FF6A1A",
    },
  });
  return res.json();
}

describe("POST /events/:id/photos oversize handling", () => {
  it("collects oversize parts in rejectedTooLarge and 413s when nothing else came through", async () => {
    const event = await createEvent();
    const big = await makeJpeg();
    const { body, contentType } = multipartBody([
      { name: "files", filename: "huge.jpg", content: big, contentType: "image/jpeg" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/events/${event.id}/photos`,
      headers: { "x-user-id": OWNER, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(413);
    const body2 = res.json() as { code: string; rejectedTooLarge: Array<{ filename: string }> };
    expect(body2.code).toBe("file_too_large");
    expect(body2.rejectedTooLarge[0]!.filename).toBe("huge.jpg");

    const photos = (app as any).photi.db
      .select()
      .from((app as any).photi.schema.photos)
      .where(eq((app as any).photi.schema.photos.eventId, event.id))
      .all();
    expect(photos).toHaveLength(0);
  });
});

describe("POST /participants/:id/selfie oversize handling", () => {
  it("returns 413 file_too_large when the selfie exceeds the limit", async () => {
    const event = await createEvent();
    const join = await app.inject({
      method: "POST",
      url: `/events/${event.slug}/join`,
      headers: { "x-user-id": ALICE },
    });
    const participantId = join.json().id as string;
    const big = await makeJpeg();
    const { body, contentType } = multipartBody([
      { name: "file", filename: "huge.jpg", content: big, contentType: "image/jpeg" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/participants/${participantId}/selfie`,
      headers: { "x-user-id": ALICE, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe("file_too_large");

    const row = (app as any).photi.db
      .select()
      .from((app as any).photi.schema.participants)
      .where(eq((app as any).photi.schema.participants.id, participantId))
      .get();
    expect(row.selfieKey).toBeNull();
    expect(row.faceVector).toBeNull();
    const storage = (app as any).photi.storage;
    expect(storage.exists(`participants/${participantId}/selfie.jpg`)).toBe(false);
  });
});
