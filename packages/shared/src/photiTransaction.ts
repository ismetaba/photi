import { z } from "zod";

export const PhotiTxnType = z.enum([
  "signup_bonus",
  "purchase",
  "distribution",
]);
export type PhotiTxnType = z.infer<typeof PhotiTxnType>;

export const PhotiTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: PhotiTxnType,
  amount: z.number().int(),
  eventId: z.string().uuid().nullish(),
  photoId: z.string().uuid().nullish(),
  createdAt: z.string().datetime(),
});
export type PhotiTransaction = z.infer<typeof PhotiTransactionSchema>;
