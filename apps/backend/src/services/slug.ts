import { randomBytes } from "node:crypto";

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

const TR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

/** Convert text to a clean ASCII kebab-case slug. */
export function slugify(input: string): string {
  // Direct map for Turkish characters that NFKD doesn't fully decompose
  // (e.g. ı, İ have no combining marks).
  const transliterated = input.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_MAP[c] ?? c);
  const stripped = transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase();
  const cleaned = stripped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return cleaned.length > 0 ? cleaned : "event";
}

/** Random 6-char lowercase alphanum suffix. */
export function randomSuffix(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHA[bytes[i]! % ALPHA.length];
  }
  return out;
}

/**
 * Generates a slug `kebab(title)-{6char}` retrying until `existsFn` reports
 * the slug is unused. Throws after 50 collisions to avoid infinite loops.
 */
export function generateEventSlug(
  title: string,
  existsFn: (slug: string) => boolean,
  suffixFn: () => string = randomSuffix,
): string {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const slug = `${base}-${suffixFn()}`;
    if (!existsFn(slug)) return slug;
  }
  throw new Error(`could not generate unique slug for ${base} after 50 tries`);
}
