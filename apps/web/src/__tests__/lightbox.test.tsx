import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Lightbox, type LightboxItem } from "../components/Lightbox.js";

function Harness({ items }: { items: LightboxItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Lightbox
        items={items}
        initialIndex={0}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

const items: LightboxItem[] = [
  { id: "a", fullUrl: "/files/a", thumbUrl: "/files/a-thumb" },
  { id: "b", fullUrl: "/files/b", thumbUrl: "/files/b-thumb" },
  { id: "c", fullUrl: "/files/c", thumbUrl: "/files/c-thumb" },
];

describe("Lightbox", () => {
  it("opens via trigger and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness items={items} />);
    await user.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("navigates with arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness items={items} />);
    await user.click(screen.getByText("Open"));

    const img = screen.getByTestId("lightbox-image") as HTMLImageElement;
    expect(img.src).toContain("/files/a");

    await user.keyboard("{ArrowRight}");
    expect((screen.getByTestId("lightbox-image") as HTMLImageElement).src).toContain("/files/b");
    await user.keyboard("{ArrowRight}");
    expect((screen.getByTestId("lightbox-image") as HTMLImageElement).src).toContain("/files/c");
    await user.keyboard("{ArrowLeft}");
    expect((screen.getByTestId("lightbox-image") as HTMLImageElement).src).toContain("/files/b");
  });
});
