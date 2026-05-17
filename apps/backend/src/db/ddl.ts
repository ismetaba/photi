/**
 * Single source of truth for SQLite DDL. We keep raw SQL here (instead of going
 * through drizzle-kit) so that:
 *   - production: `db:migrate` runs these statements idempotently against the
 *     real SQLite file.
 *   - tests: the in-memory DB applies the same DDL during boot.
 *
 * Each statement is wrapped in `IF NOT EXISTS` so re-runs are safe.
 */
export const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     display_name TEXT,
     photi_balance INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users(id),
     title TEXT NOT NULL,
     slug TEXT NOT NULL,
     cover_image_url TEXT,
     starts_at TEXT NOT NULL,
     ends_at TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'draft',
     branding_color TEXT NOT NULL,
     branding_logo_url TEXT,
     created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_slug_unique ON events(slug)`,
  `CREATE INDEX IF NOT EXISTS events_owner_idx ON events(owner_id)`,
  `CREATE TABLE IF NOT EXISTS photos (
     id TEXT PRIMARY KEY,
     event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
     storage_key TEXT NOT NULL,
     thumb_key TEXT NOT NULL,
     taken_at TEXT,
     face_vectors TEXT NOT NULL DEFAULT '[]',
     matched_user_ids TEXT NOT NULL DEFAULT '[]',
     is_featured INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'processing',
     created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   )`,
  `CREATE INDEX IF NOT EXISTS photos_event_status_idx ON photos(event_id, status)`,
  `CREATE TABLE IF NOT EXISTS participants (
     id TEXT PRIMARY KEY,
     event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id),
     selfie_key TEXT,
     face_vector TEXT,
     joined_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS participants_event_user_idx ON participants(event_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS photi_transactions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id),
     type TEXT NOT NULL,
     amount INTEGER NOT NULL,
     event_id TEXT,
     photo_id TEXT,
     created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   )`,
  `CREATE INDEX IF NOT EXISTS photi_txn_user_idx ON photi_transactions(user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS photi_txn_signup_unique
     ON photi_transactions(user_id, type) WHERE type = 'signup_bonus'`,
  `CREATE TABLE IF NOT EXISTS jobs (
     id TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     payload TEXT NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'queued',
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
     updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   )`,
  `CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status)`,
];

export function applyDdl(client: { exec: (sql: string) => void }) {
  for (const stmt of DDL) {
    client.exec(stmt);
  }
}
