import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/client.js";
import * as schema from "../db/schema.js";

const SIGNUP_BONUS = 100;

/**
 * Ensures a user exists for the given id. New users receive a `signup_bonus`
 * PhotiTransaction of +100 in the same SQLite transaction. Returns the row.
 */
export function ensureUserWithSignupBonus(db: AppDb, userId: string) {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (existing) return existing;

    const now = new Date().toISOString();
    tx.insert(schema.users)
      .values({
        id: userId,
        photiBalance: SIGNUP_BONUS,
        createdAt: now,
      })
      .run();
    tx.insert(schema.photiTransactions)
      .values({
        id: randomUUID(),
        userId,
        type: "signup_bonus",
        amount: SIGNUP_BONUS,
        createdAt: now,
      })
      .run();
    return tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get()!;
  });
}

/** Returns balance + last 20 transactions newest-first. */
export function getMeSnapshot(db: AppDb, userId: string) {
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) {
    throw new Error(`user not found: ${userId}`);
  }
  const transactions = db
    .select()
    .from(schema.photiTransactions)
    .where(eq(schema.photiTransactions.userId, userId))
    .orderBy(
      desc(schema.photiTransactions.createdAt),
      desc(schema.photiTransactions.id),
    )
    .limit(20)
    .all();

  return {
    user,
    balance: user.photiBalance,
    transactions,
  };
}

/** Adjust a user's balance by `delta` (signed). Returns new balance. */
export function adjustBalance(db: AppDb, userId: string, delta: number) {
  return db.transaction((tx) => {
    const user = tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!user) throw new Error(`user not found: ${userId}`);
    const next = user.photiBalance + delta;
    tx.update(schema.users)
      .set({ photiBalance: next })
      .where(eq(schema.users.id, userId))
      .run();
    return next;
  });
}
