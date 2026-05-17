import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { extractTakenAt } from "../services/exif.js";

async function makePlainJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function makeJpegWithExif(taken: string): Promise<Buffer> {
  // sharp 0.33+ supports `withExif` which writes IFD0 / Exif tags.
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .withExif({
      IFD0: { Make: "Photi" },
      IFD2: { DateTimeOriginal: taken },
    })
    .jpeg()
    .toBuffer();
}

describe("extractTakenAt", () => {
  it("returns null for a plain JPEG with no EXIF", async () => {
    const buf = await makePlainJpeg();
    expect(await extractTakenAt(buf)).toBeNull();
  });

  it("returns ISO string for JPEG with DateTimeOriginal", async () => {
    const buf = await makeJpegWithExif("2026:05:09 12:34:56");
    const iso = await extractTakenAt(buf);
    expect(iso).not.toBeNull();
    expect(iso).toMatch(/^2026-05-09T/);
  });

  it("returns null for non-image buffers", async () => {
    expect(await extractTakenAt(Buffer.from("not an image"))).toBeNull();
  });
});
