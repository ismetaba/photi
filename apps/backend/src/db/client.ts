import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import fs from "node:fs";
import path from "node:path";

export type AppDb = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

export interface DbInit {
  /** SQLite filename or `:memory:` for tests. */
  filename: string;
}

export function createDb({ filename }: DbInit): AppDb {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as AppDb;
  db.$client = sqlite;
  return db;
}
