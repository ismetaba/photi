import { describe, it, expect } from "vitest";
import * as schema from "../db/schema.js";

describe("Drizzle schema", () => {
  it("exports the six core tables", () => {
    for (const t of [
      "users",
      "events",
      "photos",
      "participants",
      "photiTransactions",
      "jobs",
    ]) {
      expect(schema, `missing table export: ${t}`).toHaveProperty(t);
    }
  });
});
