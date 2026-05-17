import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
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

const validInput = {
  title: "Birthday Party",
  startsAt: "2026-05-09T18:00:00.000Z",
  endsAt: "2026-05-09T22:00:00.000Z",
  brandingColor: "#FF6A1A",
};

async function createEvent(userId: string, body: Record<string, unknown> = validInput) {
  return app.inject({
    method: "POST",
    url: "/events",
    headers: { "x-user-id": userId, "content-type": "application/json" },
    payload: body,
  });
}

describe("POST /events", () => {
  it("creates an event with a kebab-{6char} slug", async () => {
    const res = await createEvent(OWNER);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.slug).toMatch(/^birthday-party-[a-z0-9]{6}$/);
    expect(body.status).toBe("draft");
    expect(body.ownerId).toBe(OWNER);
  });

  it("rejects malformed payloads with 400", async () => {
    const res = await createEvent(OWNER, { ...validInput, title: "" });
    expect(res.statusCode).toBe(400);
  });

  it("persists optional coverImageUrl on creation", async () => {
    const cover = "https://cdn.example.com/cover-A1-1.jpg";
    const res = await createEvent(OWNER, { ...validInput, coverImageUrl: cover });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.coverImageUrl).toBe(cover);

    const fetched = await app.inject({
      method: "GET",
      url: `/events/${created.slug}`,
      headers: { "x-user-id": OWNER },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().coverImageUrl).toBe(cover);
  });

  it("rejects coverImageUrl that is not a URL", async () => {
    const res = await createEvent(OWNER, { ...validInput, coverImageUrl: "not-a-url" });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /events/mine", () => {
  it("returns only the requesting user's events", async () => {
    await createEvent(OWNER);
    await createEvent(OWNER, { ...validInput, title: "Other" });
    await createEvent(OUTSIDER, { ...validInput, title: "Outsider Event" });

    const res = await app.inject({
      method: "GET",
      url: "/events/mine",
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ ownerId: string; title: string }>;
    expect(list.length).toBe(2);
    expect(list.every((e) => e.ownerId === OWNER)).toBe(true);
  });
});

describe("GET /events/:slug", () => {
  it("returns public meta only (no ownerId)", async () => {
    const created = await createEvent(OWNER);
    const slug = created.json().slug as string;
    const res = await app.inject({
      method: "GET",
      url: `/events/${slug}`,
      headers: { "x-user-id": OUTSIDER },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slug).toBe(slug);
    expect(body.title).toBe(validInput.title);
    expect(body.ownerId).toBeUndefined();
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/events/does-not-exist-zzzzzz",
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /events/:id (owner check)", () => {
  it("owner can update title", async () => {
    const created = await createEvent(OWNER);
    const id = created.json().id as string;
    const res = await app.inject({
      method: "PATCH",
      url: `/events/${id}`,
      headers: { "x-user-id": OWNER, "content-type": "application/json" },
      payload: { title: "Updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Updated");
  });

  it("non-owner gets 403", async () => {
    const created = await createEvent(OWNER);
    const id = created.json().id as string;
    const res = await app.inject({
      method: "PATCH",
      url: `/events/${id}`,
      headers: { "x-user-id": OUTSIDER, "content-type": "application/json" },
      payload: { title: "Hijack" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("publish / archive", () => {
  it("owner can publish then archive; non-owner blocked", async () => {
    const created = await createEvent(OWNER);
    const id = created.json().id as string;

    const pub = await app.inject({
      method: "POST",
      url: `/events/${id}/publish`,
      headers: { "x-user-id": OWNER },
    });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().status).toBe("live");

    const blocked = await app.inject({
      method: "POST",
      url: `/events/${id}/archive`,
      headers: { "x-user-id": OUTSIDER },
    });
    expect(blocked.statusCode).toBe(403);

    const arch = await app.inject({
      method: "POST",
      url: `/events/${id}/archive`,
      headers: { "x-user-id": OWNER },
    });
    expect(arch.statusCode).toBe(200);
    expect(arch.json().status).toBe("archived");
  });

  it("returns 404 for unknown event", async () => {
    const fake = "99999999-9999-4999-8999-999999999999";
    const res = await app.inject({
      method: "POST",
      url: `/events/${fake}/publish`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /events/:id/qr", () => {
  it("returns image/png with PNG magic bytes", async () => {
    const created = await createEvent(OWNER);
    const id = created.json().id as string;

    const res = await app.inject({
      method: "GET",
      url: `/events/${id}/qr`,
      headers: { "x-user-id": OWNER },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    const png = res.rawPayload;
    // PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it("legacy organizer route still requires auth", async () => {
    const created = await createEvent(OWNER);
    const id = created.json().id as string;
    const res = await app.inject({
      method: "GET",
      url: `/events/${id}/qr`,
      // No x-user-id
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /events/:slug/qr.png (public)", () => {
  it("returns 200 image/png without x-user-id", async () => {
    const created = await createEvent(OWNER);
    const slug = created.json().slug as string;
    const res = await app.inject({
      method: "GET",
      url: `/events/${slug}/qr.png`,
      // No x-user-id — the foyer is unauthenticated.
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    const png = res.rawPayload;
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/events/no-such-slug-zzzzzz/qr.png",
    });
    expect(res.statusCode).toBe(404);
  });
});
