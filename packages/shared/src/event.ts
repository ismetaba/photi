import { z } from "zod";

export const EventStatus = z.enum(["draft", "live", "archived"]);
export type EventStatus = z.infer<typeof EventStatus>;

export const HexColor = z.string().regex(/^#([0-9A-Fa-f]{6})$/, {
  message: "brandingColor must be a 6-digit hex value (e.g. #FF6A1A)",
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1),
  slug: z.string().min(1),
  coverImageUrl: z.string().url().nullish(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: EventStatus,
  brandingColor: HexColor,
  brandingLogoUrl: z.string().url().nullish(),
});
export type Event = z.infer<typeof EventSchema>;

export const CreateEventInput = z.object({
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  brandingColor: HexColor,
  brandingLogoUrl: z.string().url().optional(),
  coverImageUrl: z.string().url().optional(),
});
export type CreateEventInput = z.infer<typeof CreateEventInput>;

// `coverImageUrl` is already part of `CreateEventInput`, so `.partial()` is enough.
export const UpdateEventInput = CreateEventInput.partial();
export type UpdateEventInput = z.infer<typeof UpdateEventInput>;
