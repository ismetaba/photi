import { useEffect, useState } from "react";
import { Modal } from "./Modal.js";

export interface LightboxItem {
  id: string;
  fullUrl: string;
  thumbUrl: string;
}

interface Props {
  items: LightboxItem[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function Lightbox({ items, initialIndex, open, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setIndex((i) => Math.min(items.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  if (!open || items.length === 0) return null;
  const current = items[index]!;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Fotoğraf ${index + 1} / ${items.length}`}
      labelledById="lightbox-title"
    >
      <div className="flex flex-col items-center gap-4">
        <img
          src={current.fullUrl}
          alt=""
          className="max-h-[70vh] w-auto rounded-lg object-contain"
          data-testid="lightbox-image"
        />
        <div className="flex w-full justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-full bg-brand-navy/5 px-4 py-1 text-sm font-semibold disabled:opacity-30"
          >
            ← Önceki
          </button>
          <button
            type="button"
            disabled={index >= items.length - 1}
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            className="rounded-full bg-brand-navy/5 px-4 py-1 text-sm font-semibold disabled:opacity-30"
          >
            Sonraki →
          </button>
        </div>
      </div>
    </Modal>
  );
}
