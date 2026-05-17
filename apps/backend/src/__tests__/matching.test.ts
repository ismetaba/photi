import { describe, it, expect } from "vitest";
import {
  cosineDistance,
  cosineSimilarity,
  isMatch,
  MATCH_THRESHOLD,
  minDistance,
} from "../services/matching.js";

describe("matching helpers", () => {
  it("identical vectors → distance 0", () => {
    const v = [1, 2, 3];
    expect(cosineDistance(v, v)).toBeCloseTo(0, 12);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 12);
  });

  it("orthogonal vectors → distance 1", () => {
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 12);
  });

  it("MATCH_THRESHOLD is 0.5", () => {
    expect(MATCH_THRESHOLD).toBe(0.5);
  });

  it("isMatch is strict (<0.5)", () => {
    expect(isMatch(0.49)).toBe(true);
    expect(isMatch(0.5)).toBe(false);
    expect(isMatch(0.7)).toBe(false);
  });

  it("minDistance picks the closest vector", () => {
    const ref = [1, 0, 0];
    const others = [
      [0, 1, 0],
      [0.99, 0.1, 0],
    ];
    expect(minDistance(ref, others)).toBeLessThan(0.1);
  });

  it("rejects mismatched lengths", () => {
    expect(() => cosineDistance([1, 2], [1, 2, 3])).toThrow();
  });
});
