import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client.js";
import { Dropzone } from "../../../components/Dropzone.js";
import { Lightbox, type LightboxItem } from "../../../components/Lightbox.js";
import { SkeletonGrid } from "../../../components/Skeleton.js";
import { EmptyState } from "../../../components/EmptyState.js";

export interface PhotoListItem {
  id: string;
  fullUrl: string;
  thumbUrl: string;
  status: "processing" | "ready" | "awaiting_credit" | "failed";
  isFeatured: boolean;
  matchCount: number;
  takenAt?: string | null;
}

interface PageResponse {
  items: PhotoListItem[];
  nextCursor: string | null;
}

interface Props {
  eventId: string;
}

export function PhotosTab({ eventId }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["photos", eventId],
    queryFn: () => api.get<PageResponse>(`/events/${eventId}/photos?limit=100`),
    refetchInterval: 5000,
  });
  const items: PhotoListItem[] = useMemo(() => data?.items ?? [], [data]);

  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("files", file, file.name);
      const result = await api.postMultipart<{
        created?: unknown[];
        rejected?: Array<{ filename?: string | null; mimetype: string }>;
      }>(`/events/${eventId}/photos`, fd);
      return result;
    },
    onSuccess: (result) => {
      if (result?.rejected && result.rejected.length > 0) {
        setRejectedFiles((prev) => [
          ...prev,
          ...(result.rejected ?? []).map((r) => r.filename ?? r.mimetype),
        ]);
      }
      qc.invalidateQueries({ queryKey: ["photos", eventId] });
    },
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      await api.patch(`/photos/${id}`, { isFeatured: value });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", eventId] }),
  });

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const lightboxItems: LightboxItem[] = items.map((p) => ({
    id: p.id,
    fullUrl: p.fullUrl,
    thumbUrl: p.thumbUrl,
  }));

  return (
    <div className="space-y-6">
      <Dropzone
        onUpload={(file) => upload.mutateAsync(file)}
        parallel={4}
        accept="image/*"
        label="Fotoğrafları sürükleyip bırak ya da seç"
      />
      {rejectedFiles.length > 0 && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800"
        >
          Yüklenemedi (desteklenmeyen format):{" "}
          <span className="font-mono">{rejectedFiles.join(", ")}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          Fotoğraflar yüklenemedi.
        </p>
      )}
      {isLoading ? (
        <SkeletonGrid count={8} columns={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🖼️"
          title="Henüz fotoğraf yok"
          description="Yukarıdan sürükle bırak veya tıklayıp dosya seç. JPG / PNG kabul ediyoruz."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((photo, i) => (
            <li
              key={photo.id}
              className="group relative overflow-hidden rounded-lg border border-brand-navy/10"
              data-testid="photo-card"
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block w-full"
                aria-label="Fotoğrafı büyüt"
              >
                <img
                  src={photo.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-square h-full w-full object-cover"
                />
              </button>
              <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
                <span
                  className="rounded-full bg-brand-navy/80 px-2 py-0.5 text-xs font-semibold text-white"
                  data-testid="match-count"
                >
                  {photo.matchCount} eşleşme
                </span>
                {photo.status !== "ready" && (
                  <span className="rounded-full bg-brand-orange/90 px-2 py-0.5 text-xs font-semibold text-white">
                    {photo.status}
                  </span>
                )}
              </div>
              <label className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-full bg-white/90 px-2 py-1 text-xs">
                <span>Fuayede göster</span>
                <input
                  type="checkbox"
                  checked={photo.isFeatured}
                  onChange={(e) =>
                    toggleFeatured.mutate({ id: photo.id, value: e.target.checked })
                  }
                  aria-label="Fuayede göster"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
      <Lightbox
        items={lightboxItems}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}
