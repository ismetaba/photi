import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { ensureUserWithSignupBonus } from "../services/photi.js";
import type { AppDb } from "../db/client.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    user: { id: string; photiBalance: number };
  }
}

export interface IdentifyDeps {
  db: AppDb;
}

const identify: FastifyPluginAsync<IdentifyDeps> = async (app, { db }) => {
  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    // Skip routes that are intentionally public:
    // - global health probe
    // - signed-file proxy (T04)
    // - foyer-data (T09 — public foyer page can hit it without a userId)
    if (req.url === "/health") return;
    if (req.url.startsWith("/files/")) return;
    // foyer-data is `/events/{slug}/foyer-data` — match the suffix to keep the
    // matching cheap and slug-shape-agnostic.
    if (/^\/events\/[a-z0-9-]+\/foyer-data(?:\?|$)/.test(req.url)) return;
    // Public QR PNG for the foyer (A1-2). Slug-based, read-only, no PII.
    if (/^\/events\/[a-z0-9-]+\/qr\.png(?:\?|$)/.test(req.url)) return;

    const raw = req.headers["x-user-id"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
      reply
        .code(400)
        .send({ code: "missing_user", message: "x-user-id header is required" });
      return reply;
    }
    if (!UUID_REGEX.test(value)) {
      reply
        .code(400)
        .send({ code: "invalid_user_id", message: "x-user-id must be a UUID" });
      return reply;
    }
    const user = ensureUserWithSignupBonus(db, value);
    req.userId = value;
    req.user = { id: user.id, photiBalance: user.photiBalance };
  });
};

export default fp(identify, { name: "identify" });
