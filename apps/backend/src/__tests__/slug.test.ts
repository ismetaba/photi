import { describe, it, expect } from "vitest";
import { slugify, generateEventSlug } from "../services/slug.js";

describe("slugify", () => {
  it("kebab-cases ASCII text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips diacritics and Turkish characters", () => {
    expect(slugify("Doğum Günü")).toBe("dogum-gunu");
    expect(slugify("Şükran çayı İSTASYON")).toBe("sukran-cayi-istasyon");
  });

  it("apostrophes and punctuation become dashes", () => {
    expect(slugify("Ali'nin parti")).toBe("ali-nin-parti");
  });

  it("trims punctuation and collapses dashes", () => {
    expect(slugify("  Hi!!! --- World!  ")).toBe("hi-world");
  });

  it("falls back to 'event' when no chars survive", () => {
    expect(slugify("!!!")).toBe("event");
  });
});

describe("generateEventSlug", () => {
  it("produces base-XXXXXX (6 lowercase alphanum)", () => {
    const s = generateEventSlug("My Event", () => false);
    expect(s).toMatch(/^my-event-[a-z0-9]{6}$/);
  });

  it("retries on collision", () => {
    const collisions = new Set(["my-event-aaaaaa"]);
    let attempts = 0;
    const s = generateEventSlug(
      "My Event",
      (slug) => collisions.has(slug),
      // deterministic suffix generator
      () => {
        attempts += 1;
        return attempts === 1 ? "aaaaaa" : "bbbbbb";
      },
    );
    expect(s).toBe("my-event-bbbbbb");
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
