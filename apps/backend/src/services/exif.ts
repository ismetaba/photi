import exifr from "exifr";

/**
 * Returns ISO-8601 string for the photo's `DateTimeOriginal` (or
 * `CreateDate`/`ModifyDate` as fallbacks). Returns `null` for buffers without
 * EXIF data or for non-image inputs.
 */
export async function extractTakenAt(source: Buffer): Promise<string | null> {
  try {
    const data = (await exifr.parse(source, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    })) as
      | {
          DateTimeOriginal?: Date | string;
          CreateDate?: Date | string;
          ModifyDate?: Date | string;
        }
      | undefined;
    if (!data) return null;
    const candidate =
      data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate ?? null;
    if (!candidate) return null;
    const date =
      candidate instanceof Date ? candidate : new Date(String(candidate));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
