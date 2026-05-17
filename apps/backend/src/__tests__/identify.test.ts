import { describe, it, expect, beforeEach } from "vitest";
import { buildTestServer } from "../testing/buildTestServer.js";
import type { FastifyInstance } from "fastify";

const FRESH_UUID = "11111111-1111-4111-8111-111111111111";

describe("identify plugin + GET /me", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestServer();
  });

  it("returns 400 when x-user-id header is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("missing_user");
  });

  it("returns 400 when x-user-id is malformed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_user_id");
  });

  it("creates a user with 100 photi on first request", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": FRESH_UUID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(FRESH_UUID);
    expect(body.balance).toBe(100);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].type).toBe("signup_bonus");
    expect(body.transactions[0].amount).toBe(100);
  });

  it("reuses the same user on subsequent requests (no double bonus)", async () => {
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": FRESH_UUID },
    });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": FRESH_UUID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balance).toBe(100);
    expect(body.transactions).toHaveLength(1);
  });

  it("returns last 20 transactions newest-first", async () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": userId },
    });
    const { db, schema } = (app as unknown as {
      photi: { db: any; schema: any; insertTxn: (input: any) => void };
    }).photi;
    // Insert 25 fake transactions so we can verify we trim to 20.
    for (let i = 0; i < 25; i++) {
      db.insert(schema.photiTransactions)
        .values({
          id: crypto.randomUUID(),
          userId,
          type: "purchase",
          amount: i,
          createdAt: new Date(Date.now() + (i + 1) * 1000).toISOString(),
        })
        .run();
    }

    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": userId },
    });
    const body = res.json();
    expect(body.transactions).toHaveLength(20);
    // Newest first: amounts should descend 24..5.
    const amounts = body.transactions.map((t: { amount: number }) => t.amount);
    expect(amounts[0]).toBe(24);
    expect(amounts[19]).toBe(5);
  });
});
