import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullish(),
  photiBalance: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;
