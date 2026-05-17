import { z } from "zod";

export const JobStatus = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobType = z.enum([
  "process-photo",
  "match-selfie",
  "retry-awaiting",
]);
export type JobType = z.infer<typeof JobType>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  type: JobType,
  payload: z.record(z.unknown()),
  status: JobStatus,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type Job = z.infer<typeof JobSchema>;
