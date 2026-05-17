import type { FastifyPluginAsync } from "fastify";
import mime from "mime";
import type { StorageAdapter } from "../storage/index.js";

export interface FilesRouteDeps {
  storage: StorageAdapter;
}

export const filesRoute: FastifyPluginAsync<FilesRouteDeps> = async (
  app,
  { storage },
) => {
  app.get<{ Params: { key: string } }>("/files/:key", async (req, reply) => {
    const key = decodeURIComponent(req.params.key);
    if (!storage.exists(key)) {
      return reply.code(404).send({ code: "not_found" });
    }
    const ct = mime.getType(key) ?? "application/octet-stream";
    reply.header("content-type", ct);
    reply.header("cache-control", "private, max-age=300");
    return reply.send(storage.getStream(key));
  });
};
