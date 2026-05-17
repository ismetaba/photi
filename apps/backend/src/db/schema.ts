import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const nowDefault = sql`(CURRENT_TIMESTAMP)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  photiBalance: integer("photi_balance").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowDefault),
});

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    coverImageUrl: text("cover_image_url"),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    status: text("status", { enum: ["draft", "live", "archived"] })
      .notNull()
      .default("draft"),
    brandingColor: text("branding_color").notNull(),
    brandingLogoUrl: text("branding_logo_url"),
    createdAt: text("created_at").notNull().default(nowDefault),
  },
  (t) => ({
    slugUnique: uniqueIndex("events_slug_unique").on(t.slug),
    ownerIdx: index("events_owner_idx").on(t.ownerId),
  }),
);

export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    takenAt: text("taken_at"),
    // JSON-encoded number[][]
    faceVectors: text("face_vectors").notNull().default("[]"),
    // JSON-encoded string[]
    matchedUserIds: text("matched_user_ids").notNull().default("[]"),
    isFeatured: integer("is_featured", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", {
      enum: ["processing", "ready", "awaiting_credit", "failed"],
    })
      .notNull()
      .default("processing"),
    createdAt: text("created_at").notNull().default(nowDefault),
  },
  (t) => ({
    eventStatusIdx: index("photos_event_status_idx").on(t.eventId, t.status),
  }),
);

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    selfieKey: text("selfie_key"),
    // JSON-encoded number[]
    faceVector: text("face_vector"),
    joinedAt: text("joined_at").notNull().default(nowDefault),
  },
  (t) => ({
    eventUserIdx: uniqueIndex("participants_event_user_idx").on(
      t.eventId,
      t.userId,
    ),
  }),
);

export const photiTransactions = sqliteTable(
  "photi_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", {
      enum: ["signup_bonus", "purchase", "distribution"],
    }).notNull(),
    amount: integer("amount").notNull(),
    eventId: text("event_id"),
    photoId: text("photo_id"),
    createdAt: text("created_at").notNull().default(nowDefault),
  },
  (t) => ({
    userIdx: index("photi_txn_user_idx").on(t.userId),
    // Enforce at-most-one signup_bonus per user.
    signupUnique: uniqueIndex("photi_txn_signup_unique")
      .on(t.userId, t.type)
      .where(sql`${t.type} = 'signup_bonus'`),
  }),
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: ["process-photo", "match-selfie", "retry-awaiting"],
    }).notNull(),
    payload: text("payload").notNull().default("{}"),
    status: text("status", {
      enum: ["queued", "running", "done", "failed"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(nowDefault),
    updatedAt: text("updated_at").notNull().default(nowDefault),
  },
  (t) => ({
    statusIdx: index("jobs_status_idx").on(t.status),
  }),
);

export type DbSchema = {
  users: typeof users;
  events: typeof events;
  photos: typeof photos;
  participants: typeof participants;
  photiTransactions: typeof photiTransactions;
  jobs: typeof jobs;
};
