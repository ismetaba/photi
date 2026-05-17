import { z } from "zod";
import { EventSchema } from "./event.js";

export const FoyerData = z.object({
  event: EventSchema.pick({
    title: true,
    slug: true,
    brandingColor: true,
    brandingLogoUrl: true,
  }),
  featured: z.array(
    z.object({
      id: z.string(),
      thumbUrl: z.string(),
      fullUrl: z.string(),
    }),
  ),
  counts: z.object({
    participants: z.number().int().nonnegative(),
    photos: z.number().int().nonnegative(),
    distributions: z.number().int().nonnegative(),
  }),
});
export type FoyerData = z.infer<typeof FoyerData>;
