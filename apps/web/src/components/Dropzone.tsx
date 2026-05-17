import { useCallback, useEffect, useRef, useState } from "react";

export interface DropzoneItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  attempts: number;
  error?: string;
}

interface Props {
  /** Async upload of a single file. Throws to retry. */
  onUpload: (file: File) => Promise<unknown>;
  /** Maximum files in flight at once. Default 4. */
  parallel?: number;
  /** Max retries per file. Default 1 (so 2 total attempts). */
  maxRetries?: number;
  /** Accept attribute, e.g. "image/*". */
  accept?: string;
  label?: string;
}

let _id = 0;
const nextId = () => `dz-${Date.now().toString(36)}-${(_id++).toString(36)}`;

export function Dropzone({
  onUpload,
  parallel = 4,
  maxRetries = 1,
  accept = "image/*",
  label = "Fotoğrafları sürükle veya seç",
}: Props) {
  const [items, setItems] = useState<DropzoneItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(0);
  const queue = useRef<DropzoneItem[]>([]);

  const updateItem = useCallback(
    (id: string, patch: Partial<DropzoneItem>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );

  const drainRef = useRef<() => void>(() => undefined);
  drainRef.current = () => {
    while (inFlight.current < parallel && queue.current.length > 0) {
      const item = queue.current.shift()!;
      inFlight.current += 1;
      updateItem(item.id, { status: "uploading", attempts: item.attempts + 1 });
      onUpload(item.file)
        .then(() => {
          updateItem(item.id, { status: "done" });
        })
        .catch((err: unknown) => {
          if (item.attempts < maxRetries) {
            queue.current.push({ ...item, attempts: item.attempts + 1 });
            updateItem(item.id, {
              status: "queued",
              attempts: item.attempts + 1,
            });
          } else {
            updateItem(item.id, {
              status: "error",
              error: err instanceof Error ? err.message : "upload_failed",
            });
          }
        })
        .finally(() => {
          inFlight.current -= 1;
          drainRef.current();
        });
    }
  };

  const enqueue = useCallback((files: FileList | File[]) => {
    const fresh: DropzoneItem[] = Array.from(files).map((file) => ({
      id: nextId(),
      file,
      status: "queued" as const,
      attempts: 0,
    }));
    setItems((prev) => [...prev, ...fresh]);
    queue.current.push(...fresh);
    drainRef.current();
  }, []);

  useEffect(() => {
    drainRef.current();
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className="flex h-40 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-brand-navy/20 bg-brand-navy/5 text-center text-sm text-brand-navy/70 hover:border-brand-orange hover:text-brand-orange"
        data-testid="dropzone"
      >
        {label}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        data-testid="dropzone-input"
        onChange={(e) => {
          if (e.target.files) enqueue(e.target.files);
          e.target.value = "";
        }}
      />
      {items.length > 0 && (
        <ul aria-live="polite" className="mt-3 space-y-1 text-sm">
          {items.map((it) => (
            <li
              key={it.id}
              data-testid="dropzone-item"
              data-status={it.status}
              className="flex items-center justify-between rounded-md border border-brand-navy/10 px-3 py-1.5"
            >
              <span className="truncate">{it.file.name}</span>
              <span className="text-xs uppercase tracking-wider text-brand-navy/60">
                {it.status === "error"
                  ? `Hata${it.error ? ` · ${it.error}` : ""}`
                  : it.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
