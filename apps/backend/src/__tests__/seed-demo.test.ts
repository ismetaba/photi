import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine } from "../testing/fakeFaceEngine.js";
import { seedDemo, DEMO } from "../../scripts/seed-demo.js";

let app: FastifyInstance;
let fake: FakeFaceEngine;

beforeEach(async () => {
  fake = new FakeFaceEngine();
  app = await buildTestServer({ faceEngine: fake });
});

afterEach(async () => {
  await app.close();
});

function ctx() {
  return (app as any).photi as any;
}

describe("seedDemo", () => {
  it("populates 20 photos, 3 participants, and reports counts via foyer-data", async () => {
    const result = await seedDemo({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: fake,
    });
    expect(result.photoIds).toHaveLength(DEMO.totalPhotos);
    expect(result.participantIds).toHaveLength(3);
    expect(result.slug).toMatch(/^photi-demo-[a-z0-9]{6}$/);

    const foyer = await app.inject({
      method: "GET",
      url: `/events/${result.slug}/foyer-data`,
    });
    expect(foyer.statusCode).toBe(200);
    const body = foyer.json() as {
      counts: { participants: number; photos: number; distributions: number };
    };
    expect(body.counts.participants).toBe(3);
    expect(body.counts.photos).toBeGreaterThanOrEqual(15); // most photos finish ready
    expect(body.counts.distributions).toBeGreaterThan(0);
  });

  it("is idempotent — second run leaves a single Photi Demo event", async () => {
    await seedDemo({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: fake,
    });
    await seedDemo({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: fake,
    });
    const events = ctx()
      .db.select()
      .from(ctx().schema.events)
      .where(eq(ctx().schema.events.ownerId, DEMO.organizerId))
      .all();
    expect(events.length).toBe(1);
    expect(events[0].title).toBe(DEMO.eventTitle);
  });
});
