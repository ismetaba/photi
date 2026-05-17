import type { Readable } from "node:stream";

export interface StorageAdapter {
  putObject(key: string, body: Buffer, contentType?: string): Promise<void>;
  getStream(key: string): Readable;
  exists(key: string): boolean;
  remove(key: string): Promise<void>;
  /**
   * Returns a URL the web app can hand to <img>. For the local adapter this is
   * simply `/files/${urlEncodedKey}` proxied through the same Fastify instance.
   * `ttl` is accepted for compatibility with future S3 / R2 adapters.
   */
  getSignedUrl(key: string, ttlSeconds?: number): string;
}
