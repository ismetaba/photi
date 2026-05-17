import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { buildTestServer } from "../testing/buildTestServer.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestServer();
});

afterEach(async () => {
  await app.close();
});

async function makeJpeg(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 80, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function createEvent(userId: string) {
  const res = await app.inject({
    method: "POST",
    url: "/events",
    headers: { "x-user-id": userId, "content-type": "application/json" },
    payload: {
      title: "Test",
      startsAt: "2026-05-09T18:00:00.000Z",
      endsAt: "2026-05-09T22:00:00.000Z",
      brandingColor: "#FF6A1A",
    },
  });
  return res.json() as { id: string; slug: string };
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

async function uploadPhotos(eventId: string, userId: string, count = 2) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      name: "files",
      filename: `pic-${i}.jpg`,
      content: await makeJpeg(),
    });
  }
  const { body, contentType } = multipartBody(parts);
  return app.inject({
    method: "POST",
    url: `/events/${eventId}/photos`,
    headers: { "x-user-id": userId, "content-type": contentType },
    payload: body,
  });
}

describe("POST /events/:id/photos", () => {
  it("stores files, inserts photo rows, enqueues jobs", async () => {
    const event = await createEvent(OWNER);
    const res = await uploadPhotos(event.id, OWNER, 2);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { created: Array<{ id: string; status: string }> };
    expect(body.created).toHaveLength(2);
    for (const photo of body.created) {
      expect(photo.status).toBe("processing");
    }

    // Storage contains full + thumb for each photo.
    const storage = (app as any).photi.storage;
    for (const photo of body.created) {
      expect(storage.exists(`events/${event.id}/photos/${photo.id}/full.jpg`)).toBe(true);
      expect(storage.exists(`events/${event.id}/photos/${photo.id}/thumb.webp`)).toBe(true);
    }

    // Two process-photo jobs queued.
    const jobs = (app as any).photi.db
      .select()
      .from((app as any).photi.schema.jobs)
      .all() as Array<{ type: string; status: string; payload: string }>;
    const processJobs = jobs.filter((j) => j.type === "process-photo");
    expect(processJobs).toHaveLength(2);
    for (const job of processJobs) {
      expect(job.status).toBe("queued");
      expect(JSON.parse(job.payload)).toMatchObject({ photoId: expect.any(String) });
    }
  });

  it("returns 403 for non-owner", async () => {
    const event = await createEvent(OWNER);
    const res = await uploadPhotos(event.id, OUTSIDER, 1);
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /events/:id/photos", () => {
  it("returns photo list items with signed URLs and matchCount", async () => {
    const event = await createEvent(OWNER);
    await uploadPhotos(event.id, OWNER, 2);
    const res = await app.inject({
      method: "GET",
      url: `/events/${event.id}/photos`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; fullUrl: string; thumbUrl: string; matchCount: number; status: string; isFeatured: boolean }>;
      nextCursor: string | null;
    };
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item.fullUrl).toMatch(/^\/files\//);
      expect(item.thumbUrl).toMatch(/^\/files\//);
      expect(item.matchCount).toBe(0);
      expect(item.isFeatured).toBe(false);
      expect(item.status).toBe("processing");
    }
  });

  it("paginates via nextCursor", async () => {
    const event = await createEvent(OWNER);
    await uploadPhotos(event.id, OWNER, 2);
    const first = await app.inject({
      method: "GET",
      url: `/events/${event.id}/photos?limit=1`,
      headers: { "x-user-id": OWNER },
    });
    const firstBody = first.json() as { items: any[]; nextCursor: string | null };
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).toBeTruthy();

    const second = await app.inject({
      method: "GET",
      url: `/events/${event.id}/photos?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor!)}`,
      headers: { "x-user-id": OWNER },
    });
    const secondBody = second.json() as { items: any[]; nextCursor: string | null };
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.items[0].id).not.toBe(firstBody.items[0].id);
    expect(secondBody.nextCursor).toBeNull();
  });
});

describe("DELETE /photos/:id", () => {
  it("removes the row and storage objects", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];

    const res = await app.inject({
      method: "DELETE",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(204);
    const storage = (app as any).photi.storage;
    expect(storage.exists(`events/${event.id}/photos/${photo.id}/full.jpg`)).toBe(false);
    expect(storage.exists(`events/${event.id}/photos/${photo.id}/thumb.webp`)).toBe(false);
  });

  it("403 when not owner", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];
    const res = await app.inject({
      method: "DELETE",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OUTSIDER },
    });
    expect(res.statusCode).toBe(403);
  });

  it("broadcasts photo-removed when deleting a featured + ready photo", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];

    // Move the photo into the (ready, isFeatured) state directly so the
    // delete path takes the broadcast branch.
    (app as any).photi.db.$client
      .prepare("UPDATE photos SET is_featured = 1, status = 'ready' WHERE id = ?")
      .run(photo.id);

    const events: any[] = [];
    const hub = (app as any).photi.foyerHub;
    hub.subscribe(event.id, (e: any) => events.push(e));

    const res = await app.inject({
      method: "DELETE",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(204);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "photo-removed",
          eventId: event.id,
          photoId: photo.id,
        }),
      ]),
    );
  });

  it("does NOT broadcast photo-removed for a non-featured (or non-ready) photo", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];
    // Photo is created in `processing` status with isFeatured=false.

    const events: any[] = [];
    const hub = (app as any).photi.foyerHub;
    hub.subscribe(event.id, (e: any) => events.push(e));

    const res = await app.inject({
      method: "DELETE",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(204);
    expect(events.some((e) => e.type === "photo-removed")).toBe(false);
  });
});

describe("PATCH /photos/:id (isFeatured)", () => {
  it("toggles the flag and broadcasts to foyer hub", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];

    const events: any[] = [];
    const hub = (app as any).photi.foyerHub;
    hub.subscribe(event.id, (e: any) => events.push(e));

    const res = await app.inject({
      method: "PATCH",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OWNER, "content-type": "application/json" },
      payload: { isFeatured: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isFeatured).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "photo-featured",
          photoId: photo.id,
          isFeatured: true,
        }),
      ]),
    );
  });

  it("403 when not owner", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];
    const res = await app.inject({
      method: "PATCH",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OUTSIDER, "content-type": "application/json" },
      payload: { isFeatured: true },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("archived events block destructive photo ops", () => {
  async function archiveEvent(eventId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/events/${eventId}/archive`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("archived");
  }

  it("blocks POST /events/:id/photos with 409 event_archived (no row, no job)", async () => {
    const event = await createEvent(OWNER);
    await archiveEvent(event.id);

    const res = await uploadPhotos(event.id, OWNER, 1);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("event_archived");

    const { db } = (app as any).photi;
    const photoRows = db.$client
      .prepare("SELECT id FROM photos WHERE event_id = ?")
      .all(event.id);
    expect(photoRows).toHaveLength(0);
    const jobRows = db.$client
      .prepare("SELECT id FROM jobs WHERE type = 'process-photo'")
      .all();
    expect(jobRows).toHaveLength(0);
  });

  it("blocks PATCH /photos/:id with 409, no foyer broadcast, no isFeatured change", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];
    await archiveEvent(event.id);

    const events: any[] = [];
    const hub = (app as any).photi.foyerHub;
    hub.subscribe(event.id, (e: any) => events.push(e));

    const res = await app.inject({
      method: "PATCH",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OWNER, "content-type": "application/json" },
      payload: { isFeatured: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("event_archived");
    expect(events.some((e) => e.type === "photo-featured")).toBe(false);

    const row = (app as any).photi.db.$client
      .prepare("SELECT is_featured FROM photos WHERE id = ?")
      .get(photo.id) as { is_featured: number };
    expect(row.is_featured).toBe(0);
  });

  it("blocks DELETE /photos/:id with 409, photo + storage still present", async () => {
    const event = await createEvent(OWNER);
    const upload = await uploadPhotos(event.id, OWNER, 1);
    const photo = (upload.json() as any).created[0];
    await archiveEvent(event.id);

    const res = await app.inject({
      method: "DELETE",
      url: `/photos/${photo.id}`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("event_archived");

    const storage = (app as any).photi.storage;
    expect(storage.exists(`events/${event.id}/photos/${photo.id}/full.jpg`)).toBe(true);
    expect(storage.exists(`events/${event.id}/photos/${photo.id}/thumb.webp`)).toBe(true);
    const row = (app as any).photi.db.$client
      .prepare("SELECT id FROM photos WHERE id = ?")
      .get(photo.id);
    expect(row).toBeDefined();
  });

  it("still allows GET /events/:id/photos on archived events", async () => {
    const event = await createEvent(OWNER);
    await uploadPhotos(event.id, OWNER, 1);
    await archiveEvent(event.id);

    const res = await app.inject({
      method: "GET",
      url: `/events/${event.id}/photos`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as any).items).toHaveLength(1);
  });
});
