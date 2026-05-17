import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

/**
 * Node 25 ships an experimental built-in `localStorage` global that is empty
 * and has no `Storage` prototype methods — it can shadow jsdom's `window.
 * localStorage` when accessed via the bare global. Replace it with a minimal
 * in-memory polyfill that satisfies the `Storage` contract our app relies on.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
  writable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

// jsdom does not implement URL.createObjectURL / revokeObjectURL — polyfill
// with a deterministic counter so tests that fetch a Blob (e.g. Foyer QR PNG,
// QrTab) can exercise their object-URL paths.
let __objectUrlCounter = 0;
if (typeof URL !== "undefined") {
  if (typeof (URL as any).createObjectURL !== "function") {
    (URL as any).createObjectURL = (_blob: Blob) =>
      `blob:photi://test/${++__objectUrlCounter}`;
  }
  if (typeof (URL as any).revokeObjectURL !== "function") {
    (URL as any).revokeObjectURL = (_url: string) => {};
  }
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  // Reset any global fetch mocks installed by tests.
  if ("__photiOriginalFetch" in globalThis) {
    (globalThis as { fetch?: typeof fetch }).fetch =
      (globalThis as { __photiOriginalFetch?: typeof fetch }).__photiOriginalFetch;
    delete (globalThis as { __photiOriginalFetch?: typeof fetch }).__photiOriginalFetch;
  }
});
