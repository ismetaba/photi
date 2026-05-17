import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LowCreditBanner } from "../components/LowCreditBanner.js";
import { BalanceBadge } from "../components/BalanceBadge.js";

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("BalanceBadge", () => {
  it("renders the balance number", () => {
    render(<BalanceBadge balance={42} />);
    expect(screen.getByRole("status")).toHaveTextContent("42 Photi");
  });

  it("falls back to 0 for nullish", () => {
    render(<BalanceBadge balance={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("0 Photi");
  });
});

describe("LowCreditBanner", () => {
  it("renders an alert when balance < 10", () => {
    renderWithRouter(<LowCreditBanner balance={5} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Düşük kredi");
    expect(screen.getByText(/5 Photi/)).toBeInTheDocument();
  });

  it("includes awaiting count when provided", () => {
    renderWithRouter(<LowCreditBanner balance={3} awaitingCount={4} />);
    expect(screen.getByRole("alert")).toHaveTextContent("4 fotoğraf");
  });

  it("renders nothing when balance >= 10", () => {
    renderWithRouter(<LowCreditBanner balance={50} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
