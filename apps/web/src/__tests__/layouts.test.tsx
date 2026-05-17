import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { OrganizerLayout } from "../components/OrganizerLayout.js";
import { ParticipantLayout } from "../components/ParticipantLayout.js";

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).__photiOriginalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("OrganizerLayout", () => {
  it("shows the BalanceBadge with /me data", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ user: { id: "u" }, balance: 250, transactions: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<OrganizerLayout />}>
              <Route index element={<p data-testid="home">home</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("250 Photi");
    });
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("renders LowCreditBanner when balance < 10", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ user: { id: "u" }, balance: 5, transactions: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<OrganizerLayout />}>
              <Route index element={<p>home</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

describe("ParticipantLayout", () => {
  it("applies brandingColor as --event-color CSS var", async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          id: "e",
          title: "Bash",
          slug: "bash-abcdef",
          brandingColor: "#123456",
          status: "live",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={["/e/bash-abcdef"]}>
          <Routes>
            <Route path="/e/:slug" element={<ParticipantLayout />}>
              <Route index element={<p>landing</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeInTheDocument();
    });
    const wrapper = screen.getByTestId("participant-layout");
    expect(wrapper.style.getPropertyValue("--event-color")).toBe("#123456");
  });
});
