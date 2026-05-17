import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";

export type JobType = "process-photo" | "match-selfie" | "retry-awaiting";

export function enqueueJob<P extends Record<string, unknown>>(
  db: AppDb,
  type: JobType,
  payload: P,
): { id: string } {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(schema.jobs)
    .values({
      id,
      type,
      payload: JSON.stringify(payload),
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { id };
}
