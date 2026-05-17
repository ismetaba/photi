import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildServer, type BuildServerOptions } from "../server.js";

/**
 * Builds a Fastify instance backed by an in-memory SQLite database with the
 * full DDL applied. Storage is rooted in a temp directory unless the caller
 * passes `storageDir`. Each call returns a fresh, isolated server.
 */
export async function buildTestServer(
  overrides: Partial<BuildServerOptions> = {},
) {
  const storageDir =
    overrides.storageDir ?? mkdtempSync(path.join(tmpdir(), "photi-test-"));
  return buildServer({
    dbFilename: ":memory:",
    storageDir,
    applyDdlOnBoot: true,
    logger: false,
    disableSseKeepalive: true,
    ...overrides,
  });
}
