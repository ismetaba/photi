import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";

interface FoyerData {
  event: {
    title: string;
    slug: string;
    brandingColor: string;
    brandingLogoUrl?: string | null;
  };
  featured: Array<{ id: string; thumbUrl: string; fullUrl: string }>;
  counts: { participants: number; photos: number; distributions: number };
}

const ROTATION_MS = 6000;
const HEARTBEAT_MS = 30_000;
const apiBase = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "http://localhost:3000";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Foyer() {
  const { slug } = useParams<{ slug: string }>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const lastEventTimeRef = useRef<number>(Date.now());

  const dataQuery = useQuery({
    queryKey: ["foyer-data", slug],
    queryFn: () => api.get<FoyerData>(`/events/${slug}/foyer-data`),
    enabled: Boolean(slug),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!slug) return;
    api
      .get<{ id: string; slug: string; title: string }>(`/events/${slug}`)
      .then((e) => setEventId(e.id))
      .catch(() => undefined);
  }, [slug]);

  // Fetch the public QR PNG for the foyer header (A1-2). The endpoint is
  // public — we deliberately do NOT send the x-user-id header.
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    let createdUrl: string | null = null;
    fetch(`${apiBase}/events/${slug}/qr.png`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        // Guard against the abort-after-resolve race: if the slug changed (or
        // the component unmounted) between fetch and blob, drop the result so
        // we don't leak a blob URL whose cleanup has already run.
        if (controller.signal.aborted) return;
        createdUrl = URL.createObjectURL(blob);
        setQrUrl(createdUrl);
      })
      .catch((err) => {
        // Foyer runs unattended on a TV — surface failures in the console so
        // the issue is at least visible from a remote inspector / log capture.
        if ((err as { name?: string })?.name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.warn("[foyer] QR fetch failed", err);
        }
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [slug]);

  // Auto-rotate.
  useEffect(() => {
    const featured = dataQuery.data?.featured ?? [];
    if (featured.length === 0) {
      setIndex(0);
      return;
    }
    setIndex((i) => Math.min(i, featured.length - 1));
    if (featured.length < 2) return;
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % featured.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [dataQuery.data?.featured?.length]);

  // SSE subscription. Stable across refetches via a ref so the EventSource is
  // not torn down each time TanStack Query revalidates.
  const refetchRef = useRef(dataQuery.refetch);
  refetchRef.current = dataQuery.refetch;
  useEffect(() => {
    if (!eventId) return;
    const url = `${apiBase}/events/${eventId}/foyer-stream`;
    const es = new EventSource(url, { withCredentials: false });
    es.onmessage = () => {
      lastEventTimeRef.current = Date.now();
      void refetchRef.current();
    };
    es.addEventListener("hello", () => {
      lastEventTimeRef.current = Date.now();
    });
    es.onerror = () => {
      // Browser will auto-retry.
    };
    return () => es.close();
  }, [eventId]);

  // Heartbeat watchdog.
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastEventTimeRef.current > HEARTBEAT_MS) {
        if (typeof window !== "undefined") window.location.reload();
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, []);

  // F key fullscreen.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f") return;
      const el = wrapperRef.current;
      if (!el) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen?.();
      } else {
        void el.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const featured = dataQuery.data?.featured ?? [];
  const current = featured[index] ?? null;
  const event = dataQuery.data?.event;

  return (
    <div
      ref={wrapperRef}
      className="flex min-h-screen flex-col bg-brand-navy text-white"
      style={{ "--event-color": event?.brandingColor ?? "#FF6A1A" } as React.CSSProperties}
      data-testid="foyer"
    >
      <header className="grid grid-cols-3 items-center gap-4 px-6 py-4">
        <div className="flex justify-start">
          {event?.brandingLogoUrl ? (
            <img
              src={event.brandingLogoUrl}
              alt={`${event?.title ?? "Photi"} logo`}
              className="h-16 w-auto object-contain"
              data-testid="foyer-logo"
            />
          ) : (
            <span className="text-sm font-semibold uppercase tracking-widest text-white/70">
              Photi
            </span>
          )}
        </div>
        <h1
          className="text-center text-2xl font-bold"
          style={{ color: "var(--event-color)" }}
        >
          {event?.title ?? "Photi"}
        </h1>
        <div className="flex justify-end">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Etkinlik QR kodu"
              className="h-32 w-32 rounded-md bg-white p-2"
              data-testid="foyer-qr"
            />
          ) : (
            <div
              className="h-32 w-32 animate-pulse rounded-md bg-white/10"
              aria-hidden="true"
            />
          )}
        </div>
      </header>
      <main className="relative flex flex-1 items-center justify-center overflow-hidden">
        {current ? (
          <>
            <img
              key={current.id}
              src={current.fullUrl}
              alt=""
              className="max-h-[78vh] max-w-[90vw] rounded-xl object-contain shadow-2xl motion-safe:animate-[foyerFade_900ms_ease-out]"
              data-testid="foyer-image"
            />
            {featured.length > 1 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur"
              >
                {featured.map((f, i) => (
                  <span
                    key={f.id}
                    className={`block h-1.5 rounded-full transition-all ${
                      i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <span aria-hidden="true" className="text-6xl">📸</span>
            <p className="text-base font-semibold text-white/80">Henüz öne çıkan fotoğraf yok</p>
            <p className="max-w-md text-sm text-white/55">
              Organizatör fotoğraf yüklemeye başladığında burada slayt gösterisi başlayacak.
            </p>
          </div>
        )}
      </main>
      <style>{`@keyframes foyerFade { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>
      <footer className="grid grid-cols-3 gap-4 border-t border-white/10 px-6 py-4 text-center text-xs">
        <div>
          <p className="text-white/60">Katılımcı</p>
          <p className="text-2xl font-bold">{dataQuery.data?.counts.participants ?? 0}</p>
        </div>
        <div>
          <p className="text-white/60">Fotoğraf</p>
          <p className="text-2xl font-bold">{dataQuery.data?.counts.photos ?? 0}</p>
        </div>
        <div>
          <p className="text-white/60">Dağıtım</p>
          <p className="text-2xl font-bold">{dataQuery.data?.counts.distributions ?? 0}</p>
        </div>
      </footer>
      <p className="pointer-events-none fixed bottom-2 right-3 text-[10px] uppercase tracking-widest text-white/40">
        F = tam ekran
      </p>
    </div>
  );
}
