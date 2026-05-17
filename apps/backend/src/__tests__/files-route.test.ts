import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildTestServer } from "../testing/buildTestServer.js";
import type { FastifyInstance } from "fastify";

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "photi-files-"));
  app = await buildTestServer({ storageDir: dir });
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /files/:key", () => {
  it("streams the binary with the right content-type", async () => {
    const key = "events/x/photos/y/full.jpg";
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    await app.photi.storage.putObject(key, bytes, "image/jpeg");

    const res = await app.inject({
      method: "GET",
      url: "/files/" + encodeURIComponent(key),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it("returns 404 for missing key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/files/" + encodeURIComponent("nope/missing.jpg"),
    });
    expect(res.statusCode).toBe(404);
  });
});
