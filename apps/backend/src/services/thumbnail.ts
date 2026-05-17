import sharp from "sharp";

export interface ThumbnailOptions {
  /** Maximum width (px). Defaults to 400. Aspect ratio is preserved. */
  maxWidth?: number;
  /** WebP quality, 1..100. Defaults to 80. */
  quality?: number;
}

/**
 * Produces a downsized webp thumbnail. Never upscales. The output's longest
 * dimension is `maxWidth` (default 400 to match the spec).
 */
export async function makeThumbnail(
  source: Buffer,
  { maxWidth = 400, quality = 80 }: ThumbnailOptions = {},
): Promise<Buffer> {
  return sharp(source)
    .rotate() // honor EXIF orientation
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}
