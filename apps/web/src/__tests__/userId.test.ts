import { describe, it, expect } from "vitest";
import {
  getOrCreateUserId,
  clearUserId,
  USER_ID_STORAGE_KEY,
} from "../lib/userId.js";

describe("getOrCreateUserId", () => {
  it("creates a UUID on first call and persists it", () => {
    const id = getOrCreateUserId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(localStorage.getItem(USER_ID_STORAGE_KEY)).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const a = getOrCreateUserId();
    const b = getOrCreateUserId();
    expect(b).toBe(a);
  });

  it("clearUserId wipes the storage entry", () => {
    getOrCreateUserId();
    clearUserId();
    expect(localStorage.getItem(USER_ID_STORAGE_KEY)).toBeNull();
  });
});
