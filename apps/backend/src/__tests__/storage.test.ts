import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalAdapter } from "../storage/localAdapter.js";

let dir: string;
let adapter: LocalAdapter;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "photi-storage-"));
  adapter = new LocalAdapter({ rootDir: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe("LocalAdapter", () => {
  it("round-trips put + getStream", async () => {
    const key = "events/abc/photos/xyz/full.jpg";
    const payload = Buffer.from("hello-photi");
    await adapter.putObject(key, payload, "image/jpeg");
    expect(adapter.exists(key)).toBe(true);
    const stream = adapter.getStream(key);
    expect(await streamToBuffer(stream)).toEqual(payload);
  });

  it("getSignedUrl returns /files/<urlEncodedKey>", async () => {
    const key = "events/abc/photos/xyz/full.jpg";
    expect(adapter.getSignedUrl(key)).toBe(
      "/files/" + encodeURIComponent(key),
    );
  });

  it("remove deletes the file", async () => {
    const key = "tmp/hello.txt";
    await adapter.putObject(key, Buffer.from("x"));
    await adapter.remove(key);
    expect(adapter.exists(key)).toBe(false);
  });

  it("exists is false before put", () => {
    expect(adapter.exists("never-written")).toBe(false);
  });

  it("rejects keys that escape the storage root", async () => {
    await expect(
      adapter.putObject("../escape", Buffer.from("nope")),
    ).rejects.toThrow();
  });
});
