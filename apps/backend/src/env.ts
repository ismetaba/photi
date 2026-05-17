import path from "node:path";

const root = path.resolve(process.cwd());

export const env = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? path.join(root, "data", "photi.db"),
  storageDir:
    process.env.STORAGE_DIR ?? path.join(root, "storage", "objects"),
  modelDir:
    process.env.MODEL_DIR ?? path.join(root, "public", "models"),
  publicBase: process.env.PUBLIC_BASE ?? "http://localhost:5173",
};
