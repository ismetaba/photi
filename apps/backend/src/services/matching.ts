/**
 * Distance metrics + threshold for face-vector matching. We use cosine
 * distance (1 - cosine similarity) over 128-D vectors produced by face-api's
 * face_recognition net.
 */

export const MATCH_THRESHOLD = 0.5;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/** Returns the minimum cosine distance from `vec` to any of `vectors`. */
export function minDistance(vec: number[], vectors: number[][]): number {
  let best = Infinity;
  for (const v of vectors) {
    const d = cosineDistance(vec, v);
    if (d < best) best = d;
  }
  return best;
}

export function isMatch(distance: number): boolean {
  return distance < MATCH_THRESHOLD;
}
