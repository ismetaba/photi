import { describe, it, expect } from "vitest";
import {
  UserSchema,
  EventSchema,
  EventStatus,
  PhotoSchema,
  PhotoStatus,
  ParticipantSchema,
  PhotiTransactionSchema,
  PhotiTxnType,
  JobSchema,
  JobStatus,
  CreateEventInput,
  FoyerData,
} from "../index.js";

const uuid = () => "11111111-1111-4111-8111-111111111111";
const otherUuid = () => "22222222-2222-4222-8222-222222222222";
const isoNow = () => "2026-05-09T12:00:00.000Z";

const validUser = {
  id: uuid(),
  displayName: "Ada",
  photiBalance: 100,
  createdAt: isoNow(),
};

const validEvent = {
  id: uuid(),
  ownerId: otherUuid(),
  title: "Birthday",
  slug: "birthday-abc123",
  startsAt: isoNow(),
  endsAt: isoNow(),
  status: "draft" as const,
  brandingColor: "#0F1B3D",
};

describe("UserSchema", () => {
  it("parses a valid user", () => {
    expect(UserSchema.parse(validUser)).toEqual(validUser);
  });

  it("treats displayName as optional", () => {
    const { displayName: _ignored, ...withoutName } = validUser;
    expect(() => UserSchema.parse(withoutName)).not.toThrow();
  });

  it("rejects negative photi balance", () => {
    expect(() => UserSchema.parse({ ...validUser, photiBalance: -1 })).toThrow();
  });

  it("rejects non-uuid id", () => {
    expect(() => UserSchema.parse({ ...validUser, id: "not-a-uuid" })).toThrow();
  });
});

describe("EventSchema + EventStatus", () => {
  it("parses a valid draft event", () => {
    expect(EventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("EventStatus accepts the three states", () => {
    expect(EventStatus.parse("draft")).toBe("draft");
    expect(EventStatus.parse("live")).toBe("live");
    expect(EventStatus.parse("archived")).toBe("archived");
    expect(() => EventStatus.parse("paused")).toThrow();
  });

  it("rejects invalid branding color", () => {
    expect(() =>
      EventSchema.parse({ ...validEvent, brandingColor: "navy" }),
    ).toThrow();
  });

  it("rejects unknown status", () => {
    expect(() =>
      EventSchema.parse({ ...validEvent, status: "paused" as never }),
    ).toThrow();
  });

  it("requires non-empty title", () => {
    expect(() => EventSchema.parse({ ...validEvent, title: "" })).toThrow();
  });
});

describe("PhotoSchema + PhotoStatus", () => {
  const validPhoto = {
    id: uuid(),
    eventId: otherUuid(),
    storageKey: "events/x/photos/y/full.jpg",
    thumbKey: "events/x/photos/y/thumb.jpg",
    takenAt: isoNow(),
    faceVectors: [Array.from({ length: 128 }, (_, i) => i / 128)],
    matchedUserIds: [uuid()],
    isFeatured: false,
    status: "ready" as const,
  };

  it("parses a valid photo", () => {
    expect(PhotoSchema.parse(validPhoto).id).toBe(uuid());
  });

  it("PhotoStatus accepts processing/ready/awaiting_credit/failed", () => {
    for (const s of ["processing", "ready", "awaiting_credit", "failed"]) {
      expect(PhotoStatus.parse(s)).toBe(s);
    }
    expect(() => PhotoStatus.parse("done")).toThrow();
  });

  it("allows null takenAt and empty faceVectors", () => {
    expect(() =>
      PhotoSchema.parse({ ...validPhoto, takenAt: null, faceVectors: [] }),
    ).not.toThrow();
  });

  it("rejects face vector with wrong length", () => {
    expect(() =>
      PhotoSchema.parse({ ...validPhoto, faceVectors: [[0.1, 0.2, 0.3]] }),
    ).toThrow();
  });

  it("rejects unknown status", () => {
    expect(() =>
      PhotoSchema.parse({ ...validPhoto, status: "weird" as never }),
    ).toThrow();
  });
});

describe("ParticipantSchema", () => {
  const validParticipant = {
    id: uuid(),
    eventId: otherUuid(),
    userId: uuid(),
    selfieKey: "participants/x/selfie.jpg",
    faceVector: Array.from({ length: 128 }, () => 0.5),
    joinedAt: isoNow(),
  };

  it("parses a valid participant", () => {
    expect(ParticipantSchema.parse(validParticipant)).toEqual(validParticipant);
  });

  it("allows null selfieKey + faceVector", () => {
    expect(() =>
      ParticipantSchema.parse({
        ...validParticipant,
        selfieKey: null,
        faceVector: null,
      }),
    ).not.toThrow();
  });

  it("rejects faceVector with wrong length", () => {
    expect(() =>
      ParticipantSchema.parse({
        ...validParticipant,
        faceVector: [0.1, 0.2],
      }),
    ).toThrow();
  });
});

describe("PhotiTransactionSchema + PhotiTxnType", () => {
  const base = {
    id: uuid(),
    userId: otherUuid(),
    type: "signup_bonus" as const,
    amount: 100,
    createdAt: isoNow(),
  };

  it("PhotiTxnType accepts the three types", () => {
    for (const t of ["signup_bonus", "purchase", "distribution"]) {
      expect(PhotiTxnType.parse(t)).toBe(t);
    }
    expect(() => PhotiTxnType.parse("refund")).toThrow();
  });

  it("parses signup_bonus, purchase, distribution variants", () => {
    expect(PhotiTransactionSchema.parse(base).amount).toBe(100);
    expect(
      PhotiTransactionSchema.parse({ ...base, type: "purchase", amount: 500 }).amount,
    ).toBe(500);
    expect(
      PhotiTransactionSchema.parse({
        ...base,
        type: "distribution",
        amount: -1,
        eventId: uuid(),
        photoId: otherUuid(),
      }).type,
    ).toBe("distribution");
  });

  it("rejects unknown type", () => {
    expect(() =>
      PhotiTransactionSchema.parse({ ...base, type: "refund" as never }),
    ).toThrow();
  });
});

describe("JobSchema + JobStatus", () => {
  const base = {
    id: uuid(),
    type: "process-photo" as const,
    payload: { photoId: otherUuid() },
    status: "queued" as const,
    attempts: 0,
    createdAt: isoNow(),
  };

  it("JobStatus accepts queued/running/done/failed", () => {
    for (const s of ["queued", "running", "done", "failed"]) {
      expect(JobStatus.parse(s)).toBe(s);
    }
    expect(() => JobStatus.parse("paused")).toThrow();
  });

  it("rejects negative attempts", () => {
    expect(() => JobSchema.parse({ ...base, attempts: -1 })).toThrow();
  });

  it("rejects unknown job type", () => {
    expect(() =>
      JobSchema.parse({ ...base, type: "send-email" as never }),
    ).toThrow();
  });
});

describe("CreateEventInput", () => {
  const minimal = {
    title: "Wedding",
    startsAt: isoNow(),
    endsAt: isoNow(),
    brandingColor: "#FF6A1A",
  };

  it("parses minimal create payload", () => {
    expect(CreateEventInput.parse(minimal).title).toBe("Wedding");
  });

  it("rejects missing title", () => {
    const { title: _t, ...rest } = minimal;
    expect(() => CreateEventInput.parse(rest)).toThrow();
  });

  it("rejects malformed brandingColor", () => {
    expect(() =>
      CreateEventInput.parse({ ...minimal, brandingColor: "red" }),
    ).toThrow();
  });
});

describe("FoyerData", () => {
  it("parses a valid foyer payload", () => {
    const data = {
      event: {
        title: "Birthday",
        slug: "birthday-abc123",
        brandingColor: "#FF6A1A",
        brandingLogoUrl: "https://example.com/logo.png",
      },
      featured: [
        {
          id: uuid(),
          thumbUrl: "/files/thumb.jpg",
          fullUrl: "/files/full.jpg",
        },
      ],
      counts: { participants: 3, photos: 20, distributions: 12 },
    };
    expect(FoyerData.parse(data).counts.participants).toBe(3);
  });
});

describe("index re-exports", () => {
  it("exports all primary symbols", async () => {
    const mod = await import("../index.js");
    for (const sym of [
      "UserSchema",
      "EventSchema",
      "EventStatus",
      "PhotoSchema",
      "PhotoStatus",
      "ParticipantSchema",
      "PhotiTransactionSchema",
      "PhotiTxnType",
      "JobSchema",
      "JobStatus",
      "CreateEventInput",
      "FoyerData",
    ]) {
      expect(mod, `missing export: ${sym}`).toHaveProperty(sym);
    }
  });
});
