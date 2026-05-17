import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine } from "../testing/fakeFaceEngine.js";
import { IMAGE_MIME_ALLOWLIST, isImageMime } from "@photi/shared";

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

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
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
      title: "Mime Test",
      startsAt: "2026-05-09T18:00:00.000Z",
      endsAt: "2026-05-09T22:00:00.000Z",
      brandingColor: "#FF6A1A",
    },
  });
  return res.json();
}

describe("shared isImageMime / IMAGE_MIME_ALLOWLIST", () => {
  it("includes the expected types and rejects others", () => {
    expect(IMAGE_MIME_ALLOWLIST).toEqual(
      expect.arrayContaining(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
    );
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("text/plain")).toBe(false);
    expect(isImageMime(undefined)).toBe(false);
  });
});

describe("POST /events/:id/photos mime validation", () => {
  it("accepts a valid jpeg + reports rejected text/plain part with 201", async () => {
    const event = await createEvent();
    const jpeg = await makeJpeg();
    const { body, contentType } = multipartBody([
      { name: "files", filename: "ok.jpg", content: jpeg, contentType: "image/jpeg" },
      {
        name: "files",
        filename: "garbage.txt",
        content: Buffer.from("not a photo"),
        contentType: "text/plain",
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/events/${event.id}/photos`,
      headers: { "x-user-id": OWNER, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const json = res.json() as {
      created: Array<{ id: string }>;
      rejected: Array<{ filename: string; mimetype: string }>;
    };
    expect(json.created).toHaveLength(1);
    expect(json.rejected).toEqual([
      expect.objectContaining({ filename: "garbage.txt", mimetype: "text/plain" }),
    ]);

    const rows = (app as any).photi.db
      .select()
      .from((app as any).photi.schema.photos)
      .where(eq((app as any).photi.schema.photos.eventId, event.id))
      .all();
    expect(rows).toHaveLength(1);
  });

  it("returns 415 no_supported_images when only invalid parts arrive", async () => {
    const event = await createEvent();
    const { body, contentType } = multipartBody([
      {
        name: "files",
        filename: "x.txt",
        content: Buffer.from("nope"),
        contentType: "text/plain",
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/events/${event.id}/photos`,
      headers: { "x-user-id": OWNER, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe("no_supported_images");
  });
});

describe("POST /participants/:id/selfie mime validation", () => {
  it("rejects application/octet-stream with 415 and writes nothing", async () => {
    const event = await createEvent();
    const join = await app.inject({
      method: "POST",
      url: `/events/${event.slug}/join`,
      headers: { "x-user-id": ALICE },
    });
    const participantId = join.json().id as string;
    const { body, contentType } = multipartBody([
      {
        name: "file",
        filename: "selfie.bin",
        content: Buffer.from("not really an image"),
        contentType: "application/octet-stream",
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/participants/${participantId}/selfie`,
      headers: { "x-user-id": ALICE, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(415);
    const json = res.json();
    expect(json.code).toBe("unsupported_image_type");
    expect(json.got).toBe("application/octet-stream");

    const row = (app as any).photi.db
      .select()
      .from((app as any).photi.schema.participants)
      .where(eq((app as any).photi.schema.participants.id, participantId))
      .get();
    expect(row.selfieKey).toBeNull();
    expect(row.faceVector).toBeNull();
    const storage = (app as any).photi.storage;
    expect(storage.exists(`participants/${participantId}/selfie.jpg`)).toBe(false);
    expect(storage.exists(`participants/${participantId}/selfie.bin`)).toBe(false);
  });
});
