import { FACE_VECTOR_LENGTH } from "@photi/shared";
import type { FaceEngine } from "../services/faceApi.js";

/**
 * Test FaceEngine with deterministic outputs. The engine searches the buffer
 * for a programmed ASCII tag and returns the associated vectors. Use
 * `program(tag, vectors)` to wire up the response and `taggedBuffer(tag, real)`
 * to embed the tag in test bytes (appended after EOI markers so real JPEG
 * decoders are unaffected).
 */
export class FakeFaceEngine implements FaceEngine {
  private readonly map = new Map<string, number[][]>();

  program(tag: string, vectors: number[][]): void {
    for (const v of vectors) {
      if (v.length !== FACE_VECTOR_LENGTH) {
        throw new Error(
          `fake engine vector length must be ${FACE_VECTOR_LENGTH}`,
        );
      }
    }
    this.map.set(tag, vectors);
  }

  async detectAndEmbed(buffer: Buffer): Promise<number[][]> {
    for (const [tag, vectors] of this.map) {
      if (buffer.includes(tag)) {
        return vectors.map((v) => [...v]);
      }
    }
    return [];
  }
}

export function vector(seed: number, mag = 1): number[] {
  // Generate a deterministic 128-D vector that lies near direction `seed`.
  const v: number[] = new Array(FACE_VECTOR_LENGTH).fill(0);
  v[seed % FACE_VECTOR_LENGTH] = mag;
  return v;
}

/**
 * Append the tag bytes after the buffer payload. Real JPEG/WebP decoders ignore
 * trailing bytes after EOI; the fake face engine looks for the substring.
 */
export function taggedBuffer(tag: string, payload: Buffer): Buffer {
  return Buffer.concat([payload, Buffer.from(`\x00photitag:${tag}\x00`, "utf8")]);
}
