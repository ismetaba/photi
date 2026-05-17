import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../api/client.js";

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).__photiOriginalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

beforeEach(() => {
  // localStorage already cleared by setup.
});

describe("api client", () => {
  it("auto-injects x-user-id and parses JSON", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    mockFetch(async (input, init) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ ok: true, balance: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const res = await api.get<{ ok: boolean; balance: number }>("/me");
    expect(res.ok).toBe(true);
    expect(res.balance).toBe(42);
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["x-user-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("post() sends JSON body and content-type", async () => {
    let init: RequestInit | undefined;
    mockFetch(async (_input, _init) => {
      init = _init;
      return new Response("{}", {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    await api.post("/events", { title: "Bash" });
    const headers = init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ title: "Bash" }));
  });

  it("postMultipart passes FormData unchanged", async () => {
    let init: RequestInit | undefined;
    mockFetch(async (_input, _init) => {
      init = _init;
      return new Response("{}", {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "file.jpg");
    await api.postMultipart("/upload", fd);
    expect(init?.body).toBe(fd);
    const headers = init?.headers as Record<string, string>;
    // Browser/jsdom sets the multipart content-type for us.
    expect(headers["content-type"]).toBeUndefined();
  });

  it("throws ApiError with code from JSON body on non-2xx", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ code: "missing_user", message: "no header" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(api.get("/me")).rejects.toMatchObject({
      status: 400,
      code: "missing_user",
    });
    await expect(api.get("/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    const res = await api.delete<void>("/photos/abc");
    expect(res).toBeUndefined();
  });
});
