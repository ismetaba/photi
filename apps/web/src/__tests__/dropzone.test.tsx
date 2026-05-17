import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dropzone } from "../components/Dropzone.js";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

describe("Dropzone", () => {
  it("enqueues files and calls onUpload for each", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<Dropzone onUpload={onUpload} parallel={4} />);
    const input = screen.getByTestId("dropzone-input") as HTMLInputElement;
    const files = [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")];
    const user = userEvent.setup();
    await user.upload(input, files);

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(3);
    });
    expect(screen.getAllByTestId("dropzone-item")).toHaveLength(3);
    await waitFor(() => {
      expect(
        screen
          .getAllByTestId("dropzone-item")
          .every((el) => el.dataset.status === "done"),
      ).toBe(true);
    });
  });

  it("retries on first failure (maxRetries=1)", async () => {
    let calls = 0;
    const onUpload = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("flaky");
    });
    render(<Dropzone onUpload={onUpload} parallel={1} maxRetries={1} />);
    const input = screen.getByTestId("dropzone-input") as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, [makeFile("a.jpg")]);

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("dropzone-item").dataset.status).toBe("done");
    });
  });

  it("limits in-flight uploads to parallel cap", async () => {
    const inFlightSnapshots: number[] = [];
    let inFlight = 0;
    const onUpload = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      inFlightSnapshots.push(inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    render(<Dropzone onUpload={onUpload} parallel={2} />);
    const input = screen.getByTestId("dropzone-input") as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, [
      makeFile("a.jpg"),
      makeFile("b.jpg"),
      makeFile("c.jpg"),
      makeFile("d.jpg"),
      makeFile("e.jpg"),
    ]);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(5));
    expect(Math.max(...inFlightSnapshots)).toBeLessThanOrEqual(2);
  });
});
