import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { SkeletonGrid } from "../../components/Skeleton.js";
import { EmptyState } from "../../components/EmptyState.js";
import { fileUrl } from "../../api/files.js";

interface MyPhotoItem {
  id: string;
  status: string;
  isFeatured: boolean;
  takenAt?: string | null;
  fullUrl: string;
  thumbUrl: string;
}

interface MyPhotosResponse {
  items: MyPhotoItem[];
}

interface PublicEvent {
  id: string;
  slug: string;
  title: string;
}

export default function Gallery() {
  const { slug } = useParams<{ slug: string }>();
  const eventQuery = useQuery({
    queryKey: ["events", "public", slug],
    queryFn: () => api.get<PublicEvent>(`/events/${slug}`),
    enabled: Boolean(slug),
  });
  const eventId = eventQuery.data?.id;

  const photos = useQuery({
    queryKey: ["my-photos", eventId],
    queryFn: () => api.get<MyPhotosResponse>(`/me/photos?eventId=${eventId}`),
    enabled: Boolean(eventId),
    refetchInterval: 5000,
  });

  const previousCountRef = useRef<number>(-1);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (!photos.data) return;
    const count = photos.data.items.length;
    const prev = previousCountRef.current;
    if (
      typeof Notification !== "undefined" &&
      count > 0 &&
      !permissionRequestedRef.current
    ) {
      permissionRequestedRef.current = true;
      if (Notification.permission === "default") {
        void Notification.requestPermission().catch(() => undefined);
      }
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      prev >= 0 &&
      count > prev
    ) {
      const delta = count - prev;
      try {
        new Notification("Photi", {
          body:
            delta === 1
              ? "Yeni bir fotoğrafınız hazır!"
              : `${delta} yeni fotoğrafınız hazır!`,
        });
      } catch {
        // some browsers (Safari) require ServiceWorker registration; ignore.
      }
    }
    previousCountRef.current = count;
  }, [photos.data]);

  const downloadPhoto = async (item: MyPhotoItem) => {
    try {
      const res = await fetch(fileUrl(item.fullUrl), { credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${item.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore — keep silent for v1
    }
  };

  if (eventQuery.isLoading || photos.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Galerin</h1>
        </div>
        <SkeletonGrid count={4} columns={2} />
      </div>
    );
  }
  const items = photos.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon="📷"
        title="Henüz fotoğrafın yok"
        description="Etkinlik fotoğrafları yüklendikçe galerin otomatik dolar. Sayfa açık kaldığı sürece yeni eşleşmeler anlık akar."
      />
    );
  }
  return (
    <div className="space-y-4" data-testid="gallery">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand-navy">Galerin</h1>
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-navy/60">
          {items.length} fotoğraf
        </span>
      </header>
      <p className="text-xs text-brand-navy/55">
        Her 5 saniyede bir yenileniyor. Yeni eşleşmeler için bildirim açabilirsin.
      </p>
      <ul className="grid grid-cols-2 gap-3">
        {items.map((p) => (
          <li
            key={p.id}
            className="group relative overflow-hidden rounded-xl border border-brand-navy/10 bg-white shadow-sm transition hover:shadow-md"
          >
            <img
              src={fileUrl(p.thumbUrl)}
              alt=""
              loading="lazy"
              className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
            />
            {p.isFeatured && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-orange/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
                ★ Öne çıkan
              </span>
            )}
            <button
              type="button"
              onClick={() => downloadPhoto(p)}
              className="block w-full bg-brand-navy/5 px-3 py-2 text-center text-xs font-semibold text-brand-navy hover:bg-brand-navy/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
              aria-label="Fotoğrafı indir"
            >
              ↓ İndir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
