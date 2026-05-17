import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { makeThumbnail } from "../services/thumbnail.js";

async function makeSourcePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

describe("makeThumbnail", () => {
  it("produces a webp <= 400px wide", async () => {
    const src = await makeSourcePng(800, 600);
    const out = await makeThumbnail(src, { maxWidth: 400 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(400);
  });

  it("does not upscale smaller images", async () => {
    const src = await makeSourcePng(200, 150);
    const out = await makeThumbnail(src, { maxWidth: 400 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(200);
  });
});
