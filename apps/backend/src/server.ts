import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createDb, type AppDb } from "./db/client.js";
import { applyDdl } from "./db/ddl.js";
import * as schema from "./db/schema.js";
import identify from "./middleware/identify.js";
import { meRoute } from "./routes/me.js";
import { filesRoute } from "./routes/files.js";
import { eventsRoute } from "./routes/events.js";
import { photosRoute } from "./routes/photos.js";
import { participantsRoute } from "./routes/participants.js";
import { billingRoute } from "./routes/billing.js";
import { foyerRoute } from "./routes/foyer.js";
import { LocalAdapter } from "./storage/localAdapter.js";
import type { StorageAdapter } from "./storage/index.js";
import { createFoyerHub, type InMemoryFoyerHub } from "./sse/foyerHub.js";
import { createFaceEngine, type FaceEngine } from "./services/faceApi.js";
import { DemoFaceEngine } from "./services/demoFaceEngine.js";
import { JobRunner } from "./jobs/queue.js";
import { env } from "./env.js";
import { existsSync } from "node:fs";
import path from "node:path";

export interface BuildServerOptions {
  /** Override the SQLite filename. Defaults to `env.dbPath`. */
  dbFilename?: string;
  /** Override the storage root. Defaults to `env.storageDir`. */
  storageDir?: string;
  /** Optional face engine; defaults to the lazy tfjs engine in production. */
  faceEngine?: FaceEngine;
  /** When true, the server applies DDL on boot (for tests / first-run). */
  applyDdlOnBoot?: boolean;
  /** When true, starts the queue polling loop. Tests typically leave this off. */
  startQueueLoop?: boolean;
  /** Disable the SSE keepalive timer (tests). */
  disableSseKeepalive?: boolean;
  /** Override the multipart per-file size limit (bytes). Defaults to 25MB. */
  multipartLimitBytes?: number;
  /** Suppress logger noise in tests. */
  logger?: boolean;
}

export const DEFAULT_MULTIPART_LIMIT_BYTES = 25 * 1024 * 1024;

export interface AppContext {
  db: AppDb;
  schema: typeof schema;
  storage: StorageAdapter;
  foyerHub: InMemoryFoyerHub;
  faceEngine: FaceEngine;
  runner: JobRunner;
}

export async function buildServer(
  opts: BuildServerOptions = {},
): Promise<FastifyInstance & { photi: AppContext }> {
  const app = Fastify({
    logger: opts.logger ?? true,
  }) as FastifyInstance & { photi: AppContext };

  const db = createDb({ filename: opts.dbFilename ?? env.dbPath });
  if (opts.applyDdlOnBoot) {
    applyDdl(db.$client);
  }
  const storage = new LocalAdapter({
    rootDir: opts.storageDir ?? env.storageDir,
  });
  const foyerHub = createFoyerHub();
  // Default face engine: real tfjs model if the model files were downloaded,
  // otherwise a zero-dep demo engine so the local stack runs end-to-end
  // without `node scripts/download-models.mjs`.
  const faceEngine =
    opts.faceEngine ??
    (existsSync(path.join(env.modelDir, "ssd_mobilenetv1_model-weights_manifest.json"))
      ? createFaceEngine(env.modelDir)
      : new DemoFaceEngine());
  const runner = new JobRunner({ db, storage, faceEngine, foyerHub });

  app.photi = { db, schema, storage, foyerHub, faceEngine, runner };

  app.addHook("onClose", async () => {
    runner.stop();
    db.$client.close();
  });

  const multipartLimit = opts.multipartLimitBytes ?? DEFAULT_MULTIPART_LIMIT_BYTES;
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: multipartLimit, files: 200 },
  });

  // Friendly upload errors. We map FST_REQ_FILE_TOO_LARGE / FST_FILES_LIMIT to
  // HTTP 413 with a structured body, and other FST_* parsing errors to 400.
  app.setErrorHandler((err, _req, reply) => {
    const code = (err as { code?: string }).code ?? "";
    if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT") {
      return reply.code(413).send({
        code: "file_too_large",
        limitBytes: multipartLimit,
      });
    }
    if (code.startsWith("FST_")) {
      return reply.code(400).send({ code });
    }
    return reply.send(err);
  });

  app.get("/health", async () => ({ ok: true }));

  // /files is public — register before identify so it isn't gated.
  await app.register(filesRoute, { storage });
  await app.register(identify, { db });
  await app.register(meRoute, { db, storage });
  await app.register(eventsRoute, { db });
  await app.register(photosRoute, { db, storage, foyerHub });
  await app.register(participantsRoute, { db, storage, faceEngine });
  await app.register(billingRoute, { db });
  await app.register(foyerRoute, {
    db,
    storage,
    foyerHub,
    disableKeepalive: opts.disableSseKeepalive ?? false,
  });

  // Reset any jobs left `running` from a previous crash before the loop starts.
  runner.recover();
  if (opts.startQueueLoop) {
    runner.start();
  }

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  buildServer({ applyDdlOnBoot: true, startQueueLoop: true })
    .then((app) => app.listen({ port: env.port, host: "0.0.0.0" }))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
