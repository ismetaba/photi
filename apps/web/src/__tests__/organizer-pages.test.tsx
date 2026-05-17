import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Home from "../pages/organizer/Home.js";
import NewEvent from "../pages/organizer/NewEvent.js";
import { SettingsTab } from "../pages/organizer/tabs/SettingsTab.js";
import Billing from "../pages/organizer/Billing.js";
import type { EventListItem } from "../api/queries.js";

interface MockResponse {
  status?: number;
  body?: unknown;
}

function installFetch(
  table: Record<
    string,
    (init?: RequestInit) => MockResponse | Promise<MockResponse>
  >,
) {
  (globalThis as any).__photiOriginalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.replace(/^https?:\/\/[^/]+/, "")}`;
    const handler = table[key];
    if (!handler) {
      throw new Error(`Unhandled fetch: ${key}`);
    }
    const r = await handler(init);
    const status = r.status ?? 200;
    const body = r.body ?? null;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(ui: React.ReactNode, path = "/", routes?: React.ReactNode) {
  return (
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[path]}>
        {routes ?? (
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const baseEvent: EventListItem = {
  id: "e1",
  ownerId: "owner",
  title: "Test",
  slug: "test-abcdef",
  status: "draft",
  brandingColor: "#FF6A1A",
  startsAt: "2026-05-09T18:00:00.000Z",
  endsAt: "2026-05-09T22:00:00.000Z",
};

describe("Home", () => {
  it("renders the empty state and a CTA when there are no events", async () => {
    installFetch({ "GET /events/mine": () => ({ body: [] }) });
    render(wrap(<Home />));
    expect(await screen.findByText(/Henüz etkinliğin yok/)).toBeInTheDocument();
  });

  it("renders cards for each owned event", async () => {
    installFetch({
      "GET /events/mine": () => ({
        body: [
          { ...baseEvent, id: "e1", title: "First" },
          { ...baseEvent, id: "e2", title: "Second" },
        ],
      }),
    });
    render(wrap(<Home />));
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });
  });
});

describe("NewEvent", () => {
  it("submits the form and navigates on success", async () => {
    installFetch({
      "POST /events": () => ({
        status: 201,
        body: { ...baseEvent, id: "new-event" },
      }),
    });
    const Detail = () => <p data-testid="detail">detail-page</p>;
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/events/new"]}>
          <Routes>
            <Route path="/events/new" element={<NewEvent />} />
            <Route path="/events/:id" element={<Detail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByTestId("title-input"), "Doğum");
    await user.type(screen.getByTestId("starts-input"), "2026-05-09T18:00");
    await user.type(screen.getByTestId("ends-input"), "2026-05-09T22:00");
    await user.click(screen.getByRole("button", { name: /Oluştur/ }));

    await waitFor(() => {
      expect(screen.getByTestId("detail")).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("renders a 'Kapak' control and forwards coverImageUrl in the create payload", async () => {
    let captured: Record<string, unknown> | null = null;
    installFetch({
      "POST /events": (init) => {
        captured = init?.body ? JSON.parse(String(init.body)) : null;
        return { status: 201, body: { ...baseEvent, id: "new-event" } };
      },
    });
    const Detail = () => <p data-testid="detail">detail-page</p>;
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/events/new"]}>
          <Routes>
            <Route path="/events/new" element={<NewEvent />} />
            <Route path="/events/:id" element={<Detail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const coverInput = screen.getByLabelText(/Kapak/i) as HTMLInputElement;
    expect(coverInput).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("title-input"), "Doğum");
    await user.type(screen.getByTestId("starts-input"), "2026-05-09T18:00");
    await user.type(screen.getByTestId("ends-input"), "2026-05-09T22:00");
    await user.type(coverInput, "https://cdn.example.com/cover.jpg");
    await user.click(screen.getByRole("button", { name: /Oluştur/ }));

    await waitFor(() => {
      expect(screen.getByTestId("detail")).toBeInTheDocument();
    });
    expect(captured).not.toBeNull();
    expect((captured as any).coverImageUrl).toBe(
      "https://cdn.example.com/cover.jpg",
    );
  });
});

describe("SettingsTab Publish gating", () => {
  function renderWithPhotos(items: Array<{ id: string; status: string }>) {
    installFetch({
      "GET /events/e1/photos?limit=200": () => ({
        body: {
          items: items.map((i) => ({
            id: i.id,
            status: i.status,
            isFeatured: false,
            matchCount: 0,
            fullUrl: `/files/${i.id}`,
            thumbUrl: `/files/${i.id}-thumb`,
          })),
          nextCursor: null,
        },
      }),
      "POST /events/e1/publish": () => ({
        body: { ...baseEvent, status: "live" },
      }),
    });
    return render(wrap(<SettingsTab event={baseEvent} />));
  }

  it("disables Publish when there are no ready photos", async () => {
    renderWithPhotos([{ id: "p1", status: "processing" }]);
    const button = await screen.findByTestId("publish-button");
    expect(button).toBeDisabled();
  });

  it("enables Publish when at least one ready photo exists", async () => {
    renderWithPhotos([{ id: "p1", status: "ready" }]);
    const button = await screen.findByTestId("publish-button");
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("lets the organizer edit the cover image URL and PATCHes it", async () => {
    let patched: Record<string, unknown> | null = null;
    installFetch({
      "GET /events/e1/photos?limit=200": () => ({
        body: { items: [], nextCursor: null },
      }),
      "PATCH /events/e1": (init) => {
        patched = init?.body ? JSON.parse(String(init.body)) : null;
        return { body: { ...baseEvent } };
      },
    });
    render(wrap(<SettingsTab event={baseEvent} />));
    const cover = await screen.findByLabelText(/Kapak/i);
    const user = userEvent.setup();
    await user.clear(cover);
    await user.type(cover, "https://cdn.example.com/new-cover.jpg");
    await user.click(screen.getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => {
      expect(patched).not.toBeNull();
    });
    expect((patched as any).coverImageUrl).toBe(
      "https://cdn.example.com/new-cover.jpg",
    );
  });
});

describe("Billing", () => {
  it("opens purchase modal and submits a purchase", async () => {
    installFetch({
      "GET /me": () => ({
        body: { user: { id: "u" }, balance: 100, transactions: [] },
      }),
      "GET /billing/packages": () => ({
        body: [
          { id: "p100", photi: 100, priceTl: 99, label: "100 Photi" },
          { id: "p500", photi: 500, priceTl: 449, label: "500 Photi" },
        ],
      }),
      "POST /billing/purchase": () => ({ body: { balance: 600 } }),
    });
    render(wrap(<Billing />));
    expect(await screen.findByText("Photi bakiyen")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("buy-p500"));

    const modal = await screen.findByRole("dialog");
    expect(modal).toBeInTheDocument();
    const inputs = modal.querySelectorAll<HTMLInputElement>("input");
    await user.type(inputs[0]!, "Ada Lovelace");
    await user.type(inputs[1]!, "4242 4242 4242 4242");
    await user.click(screen.getByTestId("confirm-purchase"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
