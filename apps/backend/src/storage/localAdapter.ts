import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createReadStream, type ReadStream } from "node:fs";
import type { StorageAdapter } from "./index.js";

export interface LocalAdapterOptions {
  rootDir: string;
}

export class LocalAdapter implements StorageAdapter {
  private readonly rootDir: string;

  constructor({ rootDir }: LocalAdapterOptions) {
    this.rootDir = path.resolve(rootDir);
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  /** Resolve a key safely under rootDir. Throws if it escapes. */
  private resolve(key: string): string {
    const cleaned = key.replace(/^\/+/, "");
    const abs = path.resolve(this.rootDir, cleaned);
    if (!abs.startsWith(this.rootDir + path.sep) && abs !== this.rootDir) {
      throw new Error(`storage key escapes root: ${key}`);
    }
    return abs;
  }

  async putObject(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const abs = this.resolve(key);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, body);
  }

  getStream(key: string): ReadStream {
    return createReadStream(this.resolve(key));
  }

  exists(key: string): boolean {
    try {
      const abs = this.resolve(key);
      return fs.existsSync(abs);
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fsp.unlink(this.resolve(key));
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
  }

  getSignedUrl(key: string, _ttlSeconds = 3600): string {
    return `/files/${encodeURIComponent(key)}`;
  }
}
