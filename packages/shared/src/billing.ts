import { z } from "zod";

export const BillingPackageSchema = z.object({
  id: z.string(),
  photi: z.number().int().positive(),
  priceTl: z.number().int().nonnegative(),
  label: z.string(),
});
export type BillingPackage = z.infer<typeof BillingPackageSchema>;

export const BILLING_PACKAGES: readonly BillingPackage[] = [
  { id: "p100", photi: 100, priceTl: 99, label: "100 Photi" },
  { id: "p500", photi: 500, priceTl: 449, label: "500 Photi" },
  { id: "p2000", photi: 2000, priceTl: 1499, label: "2000 Photi" },
] as const;

export const PurchaseInput = z.object({
  packageId: z.string().min(1),
});
export type PurchaseInput = z.infer<typeof PurchaseInput>;
