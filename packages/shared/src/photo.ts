import { z } from "zod";

/**
 * Mime types accepted by `POST /events/:id/photos` and `POST
 * /participants/:id/selfie`. Anything outside this list is rejected with a
 * 415 response (or, for batch uploads, surfaced as `rejected[]`).
 */
export const IMAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export type ImageMime = (typeof IMAGE_MIME_ALLOWLIST)[number];

export const isImageMime = (m: string | undefined | null): m is ImageMime =>
  typeof m === "string" &&
  (IMAGE_MIME_ALLOWLIST as readonly string[]).includes(m);

export const PhotoUploadRejection = z.object({
  filename: z.string().nullish(),
  mimetype: z.string(),
});
export type PhotoUploadRejection = z.infer<typeof PhotoUploadRejection>;

export const PhotoStatus = z.enum([
  "processing",
  "ready",
  "awaiting_credit",
  "failed",
]);
export type PhotoStatus = z.infer<typeof PhotoStatus>;

export const FACE_VECTOR_LENGTH = 128;

export const FaceVectorSchema = z
  .array(z.number().finite())
  .length(FACE_VECTOR_LENGTH);

export const PhotoSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  storageKey: z.string().min(1),
  thumbKey: z.string().min(1),
  takenAt: z.string().datetime().nullable(),
  faceVectors: z.array(FaceVectorSchema),
  matchedUserIds: z.array(z.string().uuid()),
  isFeatured: z.boolean(),
  status: PhotoStatus,
});
export type Photo = z.infer<typeof PhotoSchema>;

export const PhotoListItem = PhotoSchema.pick({
  id: true,
  status: true,
  isFeatured: true,
  takenAt: true,
}).extend({
  fullUrl: z.string(),
  thumbUrl: z.string(),
  matchCount: z.number().int().nonnegative(),
});
export type PhotoListItem = z.infer<typeof PhotoListItem>;
