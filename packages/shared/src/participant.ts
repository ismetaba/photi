import { z } from "zod";
import { FaceVectorSchema } from "./photo.js";

export const ParticipantSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  selfieKey: z.string().nullable(),
  faceVector: FaceVectorSchema.nullable(),
  joinedAt: z.string().datetime(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const ParticipantListItem = ParticipantSchema.pick({
  id: true,
  userId: true,
  joinedAt: true,
}).extend({
  selfieThumbUrl: z.string().nullable(),
  matchCount: z.number().int().nonnegative(),
});
export type ParticipantListItem = z.infer<typeof ParticipantListItem>;
