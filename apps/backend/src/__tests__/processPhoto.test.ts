import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { buildTestServer } from "../testing/buildTestServer.js";
import { FakeFaceEngine, vector, taggedBuffer } from "../testing/fakeFaceEngine.js";
import { processPhoto } from "../jobs/processPhoto.js";
import { matchSelfie } from "../jobs/matchSelfie.js";
import { retryAwaiting } from "../jobs/retryAwaiting.js";
import { JobRunner } from "../jobs/queue.js";
import { enqueueJob } from "../jobs/enqueue.js";
import { ensureUserWithSignupBonus } from "../services/photi.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ALICE = "22222222-2222-4222-8222-222222222222";
const BOB = "33333333-3333-4333-8333-333333333333";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestServer();
});

afterEach(async () => {
  await app.close();
});

interface Ctx {
  db: any;
  schema: any;
  storage: any;
}
function ctx(): Ctx {
  return (app as any).photi;
}

async function setupEvent(opts: {
  ownerBalance?: number;
}): Promise<{ eventId: string; ownerId: string }> {
  const { db, schema, storage } = ctx();
  // Create owner via signup bonus then optionally adjust.
  ensureUserWithSignupBonus(db, OWNER);
  if (opts.ownerBalance !== undefined) {
    db.update(schema.users)
      .set({ photiBalance: opts.ownerBalance })
      .where(eq(schema.users.id, OWNER))
      .run();
  }
  const eventId = randomUUID();
  db.insert(schema.events)
    .values({
      id: eventId,
      ownerId: OWNER,
      title: "Worker Test",
      slug: `worker-test-${eventId.slice(0, 6)}`,
      startsAt: "2026-05-09T10:00:00.000Z",
      endsAt: "2026-05-09T12:00:00.000Z",
      brandingColor: "#FF6A1A",
      status: "live",
      createdAt: new Date().toISOString(),
    })
    .run();
  void storage;
  return { eventId, ownerId: OWNER };
}

async function addParticipant(
  eventId: string,
  userId: string,
  faceVec: number[] | null,
) {
  const { db, schema } = ctx();
  ensureUserWithSignupBonus(db, userId);
  const id = randomUUID();
  db.insert(schema.participants)
    .values({
      id,
      eventId,
      userId,
      selfieKey: faceVec ? `participants/${id}/selfie.jpg` : null,
      faceVector: faceVec ? JSON.stringify(faceVec) : null,
      joinedAt: new Date().toISOString(),
    })
    .run();
  return id;
}

async function addPhoto(
  eventId: string,
  tag: string,
  rawBody = Buffer.from("img-bytes"),
) {
  const { db, schema, storage } = ctx();
  const photoId = randomUUID();
  const storageKey = `events/${eventId}/photos/${photoId}/full.jpg`;
  const thumbKey = `events/${eventId}/photos/${photoId}/thumb.webp`;
  const buffer = taggedBuffer(tag, rawBody);
  await storage.putObject(storageKey, buffer, "image/jpeg");
  await storage.putObject(thumbKey, Buffer.from("thumb"), "image/webp");
  db.insert(schema.photos)
    .values({
      id: photoId,
      eventId,
      storageKey,
      thumbKey,
      faceVectors: "[]",
      matchedUserIds: "[]",
      status: "processing",
      createdAt: new Date().toISOString(),
    })
    .run();
  return photoId;
}

function getPhoto(photoId: string) {
  const { db, schema } = ctx();
  return db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
}

function getUser(userId: string) {
  const { db, schema } = ctx();
  return db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
}

function txnsFor(userId: string) {
  const { db, schema } = ctx();
  return db
    .select()
    .from(schema.photiTransactions)
    .where(eq(schema.photiTransactions.userId, userId))
    .all();
}

describe("processPhoto", () => {
  it("matches participants and bills the organizer 1 Photi each", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    const aliceVec = vector(0);
    const bobVec = vector(64);
    await addParticipant(eventId, ALICE, aliceVec);
    await addParticipant(eventId, BOB, bobVec);

    const fake = new FakeFaceEngine();
    fake.program("twoFaces", [vector(0), vector(64)]);
    const photoId = await addPhoto(eventId, "twoFaces");

    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );

    const photo = getPhoto(photoId);
    expect(photo.status).toBe("ready");
    const matched = JSON.parse(photo.matchedUserIds) as string[];
    expect(matched.sort()).toEqual([ALICE, BOB].sort());

    const owner = getUser(OWNER);
    expect(owner.photiBalance).toBe(98);
    const distribTxns = txnsFor(OWNER).filter((t: any) => t.type === "distribution");
    expect(distribTxns).toHaveLength(2);
    expect(distribTxns.every((t: any) => t.amount === -1)).toBe(true);
  });

  it("flips to awaiting_credit when balance is insufficient", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 0 });
    const aliceVec = vector(0);
    await addParticipant(eventId, ALICE, aliceVec);

    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");

    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );

    const photo = getPhoto(photoId);
    expect(photo.status).toBe("awaiting_credit");
    expect(JSON.parse(photo.matchedUserIds)).toEqual([]);
    const distribTxns = txnsFor(OWNER).filter((t: any) => t.type === "distribution");
    expect(distribTxns).toHaveLength(0);
  });

  it("is idempotent for already-matched users", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");

    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    const balanceAfterFirst = getUser(OWNER).photiBalance;

    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    const balanceAfterSecond = getUser(OWNER).photiBalance;
    expect(balanceAfterSecond).toBe(balanceAfterFirst);
  });

  it("does not match participants with distance >= threshold", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("farFace", [vector(64)]);
    const photoId = await addPhoto(eventId, "farFace");

    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );

    const photo = getPhoto(photoId);
    expect(photo.status).toBe("ready");
    expect(JSON.parse(photo.matchedUserIds)).toEqual([]);
    expect(getUser(OWNER).photiBalance).toBe(100);
  });
});

describe("processPhoto foyerHub broadcasts", () => {
  it("emits photo-ready when matches succeed and the photo flips to ready", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    const broadcast = vi.fn();

    await processPhoto(
      {
        db: ctx().db,
        storage: ctx().storage,
        faceEngine: fake,
        foyerHub: { broadcast },
      },
      photoId,
    );

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0]![0]).toMatchObject({
      type: "photo-ready",
      eventId,
      photoId,
    });
  });

  it("emits photo-ready even when there were no matches (no-match ready path)", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    const broadcast = vi.fn();

    await processPhoto(
      {
        db: ctx().db,
        storage: ctx().storage,
        faceEngine: fake,
        foyerHub: { broadcast },
      },
      photoId,
    );

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0]![0].type).toBe("photo-ready");
  });

  it("does NOT emit photo-ready on awaiting_credit", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 0 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    const broadcast = vi.fn();

    await processPhoto(
      {
        db: ctx().db,
        storage: ctx().storage,
        faceEngine: fake,
        foyerHub: { broadcast },
      },
      photoId,
    );

    expect(broadcast).not.toHaveBeenCalled();
    expect(getPhoto(photoId).status).toBe("awaiting_credit");
  });
});

describe("matchSelfie foyerHub broadcasts", () => {
  it("emits photo-ready when a selfie flips a photo to ready", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    expect(getPhoto(photoId).status).toBe("ready");

    const participantId = await addParticipant(eventId, ALICE, vector(0));
    const broadcast = vi.fn();
    await matchSelfie({ db: ctx().db, foyerHub: { broadcast } }, participantId);

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0]![0]).toMatchObject({
      type: "photo-ready",
      eventId,
      photoId,
    });
  });

  it("does NOT emit when the selfie hits awaiting_credit (zero balance)", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );

    // Drain organizer balance after photo is ready.
    ctx().db
      .update(ctx().schema.users)
      .set({ photiBalance: 0 })
      .where(eq(ctx().schema.users.id, OWNER))
      .run();

    const participantId = await addParticipant(eventId, ALICE, vector(0));
    const broadcast = vi.fn();
    await matchSelfie({ db: ctx().db, foyerHub: { broadcast } }, participantId);

    expect(broadcast).not.toHaveBeenCalled();
    expect(getPhoto(photoId).status).toBe("awaiting_credit");
  });
});

describe("retryAwaiting -> drained queue emits photo-ready via processPhoto", () => {
  it("after top-up, draining the queue produces a photo-ready broadcast", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 0 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    expect(getPhoto(photoId).status).toBe("awaiting_credit");

    // Top up + retry.
    ctx().db
      .update(ctx().schema.users)
      .set({ photiBalance: 50 })
      .where(eq(ctx().schema.users.id, OWNER))
      .run();
    await retryAwaiting({ db: ctx().db }, OWNER);

    const broadcast = vi.fn();
    const runner = new JobRunner({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: fake,
      foyerHub: { broadcast },
    });
    await runner.drain();

    expect(getPhoto(photoId).status).toBe("ready");
    expect(broadcast).toHaveBeenCalled();
    expect(
      broadcast.mock.calls.some(
        ([evt]) => evt?.type === "photo-ready" && evt?.photoId === photoId,
      ),
    ).toBe(true);
  });
});

describe("matchSelfie", () => {
  it("retroactively matches the participant against existing photos and bills 1 Photi", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    // Create photo with face vectors already populated by a prior process-photo.
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    // photo now has faceVectors=[vector(0)], status=ready, matched=[]

    const participantId = await addParticipant(eventId, ALICE, vector(0));
    await matchSelfie({ db: ctx().db }, participantId);

    const photo = getPhoto(photoId);
    expect(JSON.parse(photo.matchedUserIds)).toEqual([ALICE]);
    expect(getUser(OWNER).photiBalance).toBe(99);
  });

  it("flips photo to awaiting_credit when organizer is broke", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    // Run process to populate vectors first (uses 1 Photi if matches; we add no
    // participants here yet so no matches and no debit).
    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    expect(getPhoto(photoId).status).toBe("ready");

    // Now drain the organizer to 0 and add a matching participant.
    ctx().db
      .update(ctx().schema.users)
      .set({ photiBalance: 0 })
      .where(eq(ctx().schema.users.id, OWNER))
      .run();

    const participantId = await addParticipant(eventId, ALICE, vector(0));
    await matchSelfie({ db: ctx().db }, participantId);

    const photo = getPhoto(photoId);
    expect(photo.status).toBe("awaiting_credit");
    expect(JSON.parse(photo.matchedUserIds)).toEqual([]);
  });
});

describe("retryAwaiting", () => {
  it("re-enqueues process-photo for awaiting_credit photos owned by the user", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 0 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    await processPhoto(
      { db: ctx().db, storage: ctx().storage, faceEngine: fake },
      photoId,
    );
    expect(getPhoto(photoId).status).toBe("awaiting_credit");

    // Top up + retry.
    ctx().db
      .update(ctx().schema.users)
      .set({ photiBalance: 50 })
      .where(eq(ctx().schema.users.id, OWNER))
      .run();
    await retryAwaiting({ db: ctx().db }, OWNER);

    expect(getPhoto(photoId).status).toBe("processing");
    const jobs = ctx().db.select().from(ctx().schema.jobs).all();
    expect(
      jobs.some(
        (j: any) =>
          j.type === "process-photo" &&
          j.status === "queued" &&
          (JSON.parse(j.payload).photoId === photoId),
      ),
    ).toBe(true);
  });
});

describe("JobRunner.runOnce", () => {
  it("queued → done for a process-photo job", async () => {
    const { eventId } = await setupEvent({ ownerBalance: 100 });
    await addParticipant(eventId, ALICE, vector(0));
    const fake = new FakeFaceEngine();
    fake.program("oneFace", [vector(0)]);
    const photoId = await addPhoto(eventId, "oneFace");
    enqueueJob(ctx().db, "process-photo", { photoId });

    const runner = new JobRunner({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: fake,
    });
    await runner.runOnce();
    const job = ctx().db
      .select()
      .from(ctx().schema.jobs)
      .all()[0];
    expect(job.status).toBe("done");
    expect(getPhoto(photoId).status).toBe("ready");
  });

  it("marks failed after MAX_ATTEMPTS retries", async () => {
    enqueueJob(ctx().db, "process-photo", {});
    const runner = new JobRunner({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: new FakeFaceEngine(),
    });
    for (let i = 0; i < 3; i++) {
      await runner.runOnce();
    }
    const job = ctx().db
      .select()
      .from(ctx().schema.jobs)
      .all()[0];
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(3);
    expect(job.lastError).toContain("photoId");
  });

  it("returns null when queue is empty", async () => {
    const runner = new JobRunner({
      db: ctx().db,
      storage: ctx().storage,
      faceEngine: new FakeFaceEngine(),
    });
    expect(await runner.runOnce()).toBeNull();
  });
});
