import { asc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { StorageAdapter } from "../storage/index.js";
import type { FaceEngine } from "../services/faceApi.js";
import type { FoyerHub } from "../sse/foyerHub.js";
import { processPhoto } from "./processPhoto.js";
import { matchSelfie } from "./matchSelfie.js";
import { retryAwaiting } from "./retryAwaiting.js";

const MAX_ATTEMPTS = 3;

export interface JobRunnerDeps {
  db: AppDb;
  storage: StorageAdapter;
  faceEngine: FaceEngine;
  /** Optional foyer hub. When present, processPhoto emits photo-ready events. */
  foyerHub?: FoyerHub;
}

export class JobRunner {
  private readonly deps: JobRunnerDeps;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: JobRunnerDeps) {
    this.deps = deps;
  }

  /**
   * Pulls the oldest queued job (if any), marks it `running`, dispatches to
   * the type-specific handler, and updates the job row. Returns the row id of
   * the processed job, or null if the queue is empty.
   */
  async runOnce(): Promise<string | null> {
    const job = this.deps.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "queued"))
      .orderBy(asc(schema.jobs.createdAt))
      .limit(1)
      .get();
    if (!job) return null;

    this.deps.db
      .update(schema.jobs)
      .set({ status: "running", updatedAt: new Date().toISOString() })
      .where(eq(schema.jobs.id, job.id))
      .run();

    try {
      const payload = JSON.parse(job.payload) as Record<string, unknown>;
      switch (job.type) {
        case "process-photo": {
          const photoId = payload.photoId as string | undefined;
          if (!photoId) throw new Error("missing photoId in payload");
          await processPhoto(this.deps, photoId);
          break;
        }
        case "match-selfie": {
          const participantId = payload.participantId as string | undefined;
          if (!participantId) throw new Error("missing participantId in payload");
          await matchSelfie(this.deps, participantId);
          break;
        }
        case "retry-awaiting": {
          const userId = payload.userId as string | undefined;
          if (!userId) throw new Error("missing userId in payload");
          await retryAwaiting(this.deps, userId);
          break;
        }
        default:
          throw new Error(`unknown job type: ${job.type}`);
      }
      this.deps.db
        .update(schema.jobs)
        .set({ status: "done", updatedAt: new Date().toISOString() })
        .where(eq(schema.jobs.id, job.id))
        .run();
    } catch (err) {
      const attempts = job.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
      this.deps.db
        .update(schema.jobs)
        .set({
          attempts,
          status,
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.jobs.id, job.id))
        .run();
    }

    return job.id;
  }

  /**
   * Resets jobs that were left in `running` after a crash. Each is bumped one
   * attempt; if it now exceeds `MAX_ATTEMPTS` it becomes `failed`, otherwise
   * it goes back to `queued`. `lastError` is set to `interrupted` so operators
   * can tell why.
   */
  recover(): number {
    const stuck = this.deps.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "running"))
      .all();
    const now = new Date().toISOString();
    let n = 0;
    for (const row of stuck) {
      const attempts = row.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
      this.deps.db
        .update(schema.jobs)
        .set({ status, attempts, lastError: "interrupted", updatedAt: now })
        .where(eq(schema.jobs.id, row.id))
        .run();
      n += 1;
    }
    return n;
  }

  /** Drains the queue, processing jobs sequentially until empty. */
  async drain(): Promise<number> {
    let count = 0;
    while ((await this.runOnce()) !== null) count++;
    return count;
  }

  start(intervalMs = 2000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => undefined);
    }, intervalMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
