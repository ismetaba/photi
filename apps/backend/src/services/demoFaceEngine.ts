import { createHash } from "node:crypto";
import { FACE_VECTOR_LENGTH } from "@photi/shared";
import type { FaceEngine } from "./faceApi.js";

/**
 * Zero-dependency FaceEngine for demo / local runs that don't have the
 * face-api models downloaded. It pretends every uploaded image contains
 * exactly one face and derives a deterministic 128-D unit-vector from a
 * SHA-256 of the buffer, so:
 *   - the same selfie always produces the same embedding (stable matching),
 *   - different selfies typically embed far apart in cosine space.
 *
 * This is intentionally crude — it lets the end-to-end flow run on a laptop
 * without a 200 MB model download. Production deployments wire up the real
 * `createFaceEngine()` via `MODEL_DIR`.
 */
export class DemoFaceEngine implements FaceEngine {
  async detectAndEmbed(buffer: Buffer): Promise<number[][]> {
    // Reserve a couple of small inputs for the "no face" case so the upstream
    // validator (UI shows "yüz tespit edilemedi") still has a path.
    if (buffer.length < 1024) return [];
    return [embed(buffer)];
  }
}

function embed(buffer: Buffer): number[] {
  const vec = new Array<number>(FACE_VECTOR_LENGTH).fill(0);
  // Expand the 32-byte SHA-256 into a 128-D vector by stretching each byte to
  // four floats in [-1, 1] and then L2-normalising.
  const digest = createHash("sha256").update(buffer).digest();
  for (let i = 0; i < FACE_VECTOR_LENGTH; i += 1) {
    const byte = digest[i % digest.length] ?? 0;
    // Use index parity to add some position-dependent variation.
    const sign = ((byte ^ i) & 1) === 0 ? 1 : -1;
    vec[i] = sign * (byte / 255);
  }
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}
