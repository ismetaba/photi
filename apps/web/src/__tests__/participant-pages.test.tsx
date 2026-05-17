import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import EventLanding from "../pages/participant/EventLanding.js";
import Selfie from "../pages/participant/Selfie.js";
import Gallery from "../pages/participant/Gallery.js";
import Foyer from "../pages/participant/Foyer.js";

interface MockResponse {
  status?: number;
  body?: unknown;
}

interface RawResponse {
  status?: number;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

function installFetch(
  table: Record<string, () => MockResponse | RawResponse | Promise<MockResponse | RawResponse>>,
) {
  (globalThis as any).__photiOriginalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.replace(/^https?:\/\/[^/]+/, "")}`;
    const handler = table[key];
    if (!handler) throw new Error(`Unhandled fetch: ${key}`);
    const r = (await handler()) as MockResponse & RawResponse;
    const status = r.status ?? 200;
    if (status === 204) return new Response(null, { status });
    if (r.headers) {
      // Caller is producing a non-JSON response (e.g. image/png blob).
      return new Response((r.body as BodyInit | null) ?? null, {
        status,
        headers: r.headers,
      });
    }
    return new Response(JSON.stringify(r.body ?? null), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("EventLanding", () => {
  it("clicking Katıl hits join then navigates to /selfie", async () => {
    let joinCalled = 0;
    installFetch({
      "GET /events/bash-abcdef": () => ({
        body: {
          id: "e1",
          title: "Bash",
          slug: "bash-abcdef",
          brandingColor: "#FF6A1A",
          status: "live",
          startsAt: "2026-05-09T18:00:00.000Z",
          endsAt: "2026-05-09T22:00:00.000Z",
        },
      }),
      "POST /events/bash-abcdef/join": () => {
        joinCalled++;
        return { body: { id: "p1" } };
      },
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef"]}>
          <Routes>
            <Route path="/e/:slug" element={<EventLanding />} />
            <Route path="/e/:slug/selfie" element={<p>selfie-page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    const join = await screen.findByTestId("join-button");
    await user.click(join);
    await waitFor(() => {
      expect(screen.getByText("selfie-page")).toBeInTheDocument();
    });
    expect(joinCalled).toBe(1);
  });
});

describe("Selfie delete-my-data", () => {
  it("calls DELETE participant when 'Verimi sil' clicked", async () => {
    let deleteCalled = 0;
    installFetch({
      "GET /events/bash-abcdef": () => ({
        body: {
          id: "e1",
          title: "Bash",
          slug: "bash-abcdef",
          brandingColor: "#FF6A1A",
          status: "live",
          startsAt: "2026-05-09T18:00:00.000Z",
          endsAt: "2026-05-09T22:00:00.000Z",
        },
      }),
      "POST /events/bash-abcdef/join": () => ({ body: { id: "part-1" } }),
      "DELETE /participants/part-1": () => {
        deleteCalled++;
        return { status: 204 };
      },
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef/selfie"]}>
          <Routes>
            <Route path="/e/:slug/selfie" element={<Selfie />} />
            <Route path="/e/:slug" element={<p>landing-page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    const delBtn = await screen.findByTestId("delete-my-data");
    await waitFor(() => expect(delBtn).not.toBeDisabled());
    await user.click(delBtn);
    await waitFor(() => {
      expect(screen.getByText("landing-page")).toBeInTheDocument();
    });
    expect(deleteCalled).toBe(1);
  });
});

describe("Gallery notifications", () => {
  let originalNotification: any;
  beforeEach(() => {
    originalNotification = (globalThis as any).Notification;
  });
  afterEach(() => {
    (globalThis as any).Notification = originalNotification;
  });

  it("fires Notification on count delta when permission is granted", async () => {
    const ctor = vi.fn();
    class FakeNotification {
      constructor(public title: string, public opts?: NotificationOptions) {
        ctor(title, opts);
      }
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn().mockResolvedValue("granted" as NotificationPermission);
    }
    (globalThis as any).Notification = FakeNotification;

    let call = 0;
    installFetch({
      "GET /events/bash-abcdef": () => ({
        body: {
          id: "e1",
          title: "Bash",
          slug: "bash-abcdef",
          brandingColor: "#FF6A1A",
          status: "live",
          startsAt: "2026-05-09T18:00:00.000Z",
          endsAt: "2026-05-09T22:00:00.000Z",
        },
      }),
      "GET /me/photos?eventId=e1": () => {
        call++;
        const items =
          call === 1
            ? [{ id: "a", status: "ready", isFeatured: false, fullUrl: "/files/a", thumbUrl: "/files/at" }]
            : [
                { id: "a", status: "ready", isFeatured: false, fullUrl: "/files/a", thumbUrl: "/files/at" },
                { id: "b", status: "ready", isFeatured: false, fullUrl: "/files/b", thumbUrl: "/files/bt" },
              ];
        return { body: { items } };
      },
    });
    const qc = client();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/e/bash-abcdef/gallery"]}>
          <Routes>
            <Route path="/e/:slug/gallery" element={<Gallery />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("gallery")).toBeInTheDocument());
    expect(ctor).not.toHaveBeenCalled();

    // Trigger second fetch via invalidate.
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["my-photos", "e1"] });
    });
    await waitFor(() => expect(ctor).toHaveBeenCalledTimes(1));
    expect(ctor.mock.calls[0]![0]).toBe("Photi");
  });
});

describe("Foyer rotation", () => {
  let originalEventSource: any;
  let lastEventSource: any = null;
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    originalEventSource = (globalThis as any).EventSource;
    (globalThis as any).EventSource = class {
      addEventListener = vi.fn();
      close = vi.fn();
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor() {
        lastEventSource = this;
      }
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).EventSource = originalEventSource;
    lastEventSource = null;
  });

  it("rotates featured photos every 6s", async () => {
    installFetch({
      "GET /events/bash-abcdef/foyer-data": () => ({
        body: {
          event: {
            title: "Bash",
            slug: "bash-abcdef",
            brandingColor: "#FF6A1A",
            brandingLogoUrl: null,
          },
          featured: [
            { id: "a", thumbUrl: "/files/at", fullUrl: "/files/a-full" },
            { id: "b", thumbUrl: "/files/bt", fullUrl: "/files/b-full" },
            { id: "c", thumbUrl: "/files/ct", fullUrl: "/files/c-full" },
          ],
          counts: { participants: 1, photos: 3, distributions: 0 },
        },
      }),
      "GET /events/bash-abcdef": () => ({
        body: {
          id: "e1",
          slug: "bash-abcdef",
          title: "Bash",
        },
      }),
      "GET /events/bash-abcdef/qr.png": () => ({
        status: 200,
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        headers: { "content-type": "image/png" },
      }),
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef/foyer"]}>
          <Routes>
            <Route path="/e/:slug/foyer" element={<Foyer />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("foyer-image")).toBeInTheDocument();
    });
    expect((screen.getByTestId("foyer-image") as HTMLImageElement).src).toContain("a-full");
    await act(async () => {
      vi.advanceTimersByTime(6100);
    });
    expect((screen.getByTestId("foyer-image") as HTMLImageElement).src).toContain("b-full");
    await act(async () => {
      vi.advanceTimersByTime(6100);
    });
    expect((screen.getByTestId("foyer-image") as HTMLImageElement).src).toContain("c-full");
  });

  it("refetches foyer-data when SSE delivers a photo-ready event", async () => {
    let foyerDataCalls = 0;
    installFetch({
      "GET /events/bash-abcdef/foyer-data": () => {
        foyerDataCalls++;
        const featured =
          foyerDataCalls === 1
            ? []
            : [{ id: "a", thumbUrl: "/files/at", fullUrl: "/files/a-full" }];
        return {
          body: {
            event: {
              title: "Bash",
              slug: "bash-abcdef",
              brandingColor: "#FF6A1A",
              brandingLogoUrl: null,
            },
            featured,
            counts: {
              participants: 1,
              photos: featured.length,
              distributions: 0,
            },
          },
        };
      },
      "GET /events/bash-abcdef": () => ({
        body: { id: "e1", slug: "bash-abcdef", title: "Bash" },
      }),
      "GET /events/bash-abcdef/qr.png": () => ({
        status: 200,
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        headers: { "content-type": "image/png" },
      }),
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef/foyer"]}>
          <Routes>
            <Route path="/e/:slug/foyer" element={<Foyer />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(foyerDataCalls).toBeGreaterThanOrEqual(1);
    });
    // First fetch returned an empty featured list — no foyer-image yet.
    expect(screen.queryByTestId("foyer-image")).toBeNull();
    expect(lastEventSource).not.toBeNull();

    // Simulate the backend pushing a photo-ready event over SSE.
    await act(async () => {
      lastEventSource?.onmessage?.({
        data: JSON.stringify({
          eventId: "e1",
          type: "photo-ready",
          photoId: "a",
          isFeatured: true,
        }),
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(screen.getByTestId("foyer-image")).toBeInTheDocument();
    });
    expect(foyerDataCalls).toBeGreaterThanOrEqual(2);
  });

  it("refetches foyer-data when SSE delivers a photo-removed event and drops the deleted photo", async () => {
    let foyerDataCalls = 0;
    installFetch({
      "GET /events/bash-abcdef/foyer-data": () => {
        foyerDataCalls++;
        const featured =
          foyerDataCalls === 1
            ? [
                { id: "a", thumbUrl: "/files/at", fullUrl: "/files/a-full" },
                { id: "b", thumbUrl: "/files/bt", fullUrl: "/files/b-full" },
              ]
            : [{ id: "b", thumbUrl: "/files/bt", fullUrl: "/files/b-full" }];
        return {
          body: {
            event: {
              title: "Bash",
              slug: "bash-abcdef",
              brandingColor: "#FF6A1A",
              brandingLogoUrl: null,
            },
            featured,
            counts: {
              participants: 1,
              photos: featured.length,
              distributions: 0,
            },
          },
        };
      },
      "GET /events/bash-abcdef": () => ({
        body: { id: "e1", slug: "bash-abcdef", title: "Bash" },
      }),
      "GET /events/bash-abcdef/qr.png": () => ({
        status: 200,
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        headers: { "content-type": "image/png" },
      }),
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef/foyer"]}>
          <Routes>
            <Route path="/e/:slug/foyer" element={<Foyer />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("foyer-image")).toBeInTheDocument();
    });
    expect((screen.getByTestId("foyer-image") as HTMLImageElement).src).toContain(
      "a-full",
    );
    expect(lastEventSource).not.toBeNull();

    // Simulate the backend pushing a photo-removed event over SSE.
    await act(async () => {
      lastEventSource?.onmessage?.({
        data: JSON.stringify({
          eventId: "e1",
          type: "photo-removed",
          photoId: "a",
        }),
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(foyerDataCalls).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId("foyer-image") as HTMLImageElement).src,
      ).toContain("b-full");
    });
  });

  it("renders a QR image in the header sourced from the public qr.png endpoint", async () => {
    let qrFetched = 0;
    let qrAuthHeader: string | null | undefined = undefined;
    installFetch({
      "GET /events/bash-abcdef/foyer-data": () => ({
        body: {
          event: {
            title: "Bash",
            slug: "bash-abcdef",
            brandingColor: "#FF6A1A",
            brandingLogoUrl: null,
          },
          featured: [],
          counts: { participants: 0, photos: 0, distributions: 0 },
        },
      }),
      "GET /events/bash-abcdef": () => ({
        body: { id: "e1", slug: "bash-abcdef", title: "Bash" },
      }),
      "GET /events/bash-abcdef/qr.png": () => {
        qrFetched++;
        return {
          status: 200,
          body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          headers: { "content-type": "image/png" },
        };
      },
    });
    // Spy on outgoing requests to confirm no auth header is sent for the QR.
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/qr.png")) {
        const h = init?.headers as Record<string, string> | undefined;
        qrAuthHeader = h?.["x-user-id"] ?? null;
      }
      return originalFetch(input, init);
    });

    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef/foyer"]}>
          <Routes>
            <Route path="/e/:slug/foyer" element={<Foyer />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const qr = await screen.findByAltText(/qr/i);
    expect(qr).toBeInstanceOf(HTMLImageElement);
    expect((qr as HTMLImageElement).src).toMatch(/^blob:|qr\.png/);
    expect(qrFetched).toBeGreaterThanOrEqual(1);
    // Public endpoint — no x-user-id header should be set on the QR fetch.
    expect(qrAuthHeader).toBeFalsy();
  });
});
