import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { BILLING_PACKAGES, PurchaseInput } from "@photi/shared";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";
import { enqueueJob } from "../jobs/enqueue.js";

export interface BillingRouteDeps {
  db: AppDb;
}

export const billingRoute: FastifyPluginAsync<BillingRouteDeps> = async (
  app,
  { db },
) => {
  app.get("/billing/packages", async () => BILLING_PACKAGES);

  app.post("/billing/purchase", async (req, reply) => {
    const parsed = PurchaseInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ code: "invalid_input" });
    const pkg = BILLING_PACKAGES.find((p) => p.id === parsed.data.packageId);
    if (!pkg) return reply.code(400).send({ code: "unknown_package" });

    const result = db.transaction((tx) => {
      const user = tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, req.userId))
        .get();
      if (!user) throw new Error(`user not found: ${req.userId}`);
      const newBalance = user.photiBalance + pkg.photi;
      tx.update(schema.users)
        .set({ photiBalance: newBalance })
        .where(eq(schema.users.id, user.id))
        .run();
      tx.insert(schema.photiTransactions)
        .values({
          id: randomUUID(),
          userId: user.id,
          type: "purchase",
          amount: pkg.photi,
          createdAt: new Date().toISOString(),
        })
        .run();
      return { balance: newBalance };
    });

    enqueueJob(db, "retry-awaiting", { userId: req.userId });
    return { balance: result.balance, package: pkg };
  });
};
