import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client.js";
import { Button } from "../../components/Button.js";
import { Skeleton } from "../../components/Skeleton.js";
import { EmptyState } from "../../components/EmptyState.js";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
}

interface ParticipantRow {
  id: string;
  selfieKey: string | null;
  faceVector: string | null;
}

export default function Selfie() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const eventQuery = useQuery({
    queryKey: ["events", "public", slug],
    queryFn: () => api.get<PublicEvent>(`/events/${slug}`),
    enabled: Boolean(slug),
  });

  const upload = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!participantId) throw new Error("missing_participant");
      const fd = new FormData();
      fd.append("file", blob, "selfie.jpg");
      return api.postMultipart<ParticipantRow>(
        `/participants/${participantId}/selfie`,
        fd,
      );
    },
    onSuccess: () => setDone(true),
    onError: (err) => {
      setError(err instanceof ApiError ? err.code : "upload_failed");
    },
  });

  const deleteMyData = useMutation({
    mutationFn: async () => {
      if (!participantId) return;
      await api.delete(`/participants/${participantId}`);
    },
    onSuccess: () => navigate(`/e/${slug}`),
  });

  // Ensure we have a participantId by hitting join (idempotent). Errors are
  // surfaced via the same `error` state used for capture failures.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api
      .post<{ id: string }>(`/events/${slug}/join`)
      .then((p) => {
        if (!cancelled) setParticipantId(p.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.code : "join_failed");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch {
      setError("camera_blocked");
    }
  };

  const captureAndSend = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (!blob) {
      setError("capture_failed");
      return;
    }
    upload.mutate(blob);
  };

  const onFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    upload.mutate(file);
  };

  if (eventQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-full" />
      </div>
    );
  }
  if (!eventQuery.data) {
    return (
      <EmptyState
        icon="🔍"
        title="Etkinlik bulunamadı"
        description="Bu bağlantı geçersiz ya da etkinlik artık aktif değil."
      />
    );
  }

  if (done) {
    return (
      <div
        className="flex flex-col items-center gap-4 text-center"
        data-testid="selfie-done"
      >
        <span aria-hidden className="text-6xl">✓</span>
        <h1 className="text-2xl font-bold">Hazırsın!</h1>
        <p className="text-sm text-brand-navy/70">
          Sen göründüğünde fotoğraflar galerine düşer.
        </p>
        <Button type="button" onClick={() => navigate(`/e/${slug}/gallery`)}>
          Galeriyi aç
        </Button>
        <button
          type="button"
          onClick={() => deleteMyData.mutate()}
          className="text-xs underline text-brand-navy/60 hover:text-red-700"
          data-testid="delete-my-data"
        >
          Verimi sil
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Selfie çek</h1>
      <p className="text-sm text-brand-navy/70">
        Selfie ve yüz vektörünüz yalnızca bu etkinlikte sizi tanımak için kullanılır.
        İstediğiniz an "Verimi sil" diyerek tamamen silebilirsiniz.
      </p>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy/15 to-brand-navy/5 ring-1 ring-brand-navy/10">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          data-testid="camera-preview"
        />
        <canvas ref={canvasRef} className="hidden" />
        {!cameraOn && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-brand-navy/55">
            <span aria-hidden="true" className="text-5xl">📸</span>
            <span className="text-xs font-medium">Kamerayı açınca selfie burada görünecek</span>
          </div>
        )}
        {upload.isPending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm">
            <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-brand-navy/20 border-t-brand-orange" />
            <span className="text-sm font-medium text-brand-navy">Yüz vektörü hesaplanıyor…</span>
          </div>
        )}
      </div>
      {!cameraOn ? (
        <Button type="button" onClick={startCamera} data-testid="start-camera">
          Kamerayı aç
        </Button>
      ) : (
        <Button
          type="button"
          onClick={captureAndSend}
          disabled={upload.isPending}
          data-testid="capture"
        >
          {upload.isPending ? "Gönderiliyor…" : "Çek + gönder"}
        </Button>
      )}
      <details className="group rounded-xl border border-brand-navy/10 bg-white/60 px-4 py-3 text-xs text-brand-navy/70 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium text-brand-navy">
          <span>Kameraya erişemiyor musunuz?</span>
          <span aria-hidden="true" className="text-brand-navy/40 transition group-open:rotate-180">▾</span>
        </summary>
        <p className="mt-3 text-[11px] leading-relaxed text-brand-navy/55">
          Tarayıcı izin vermediyse galeriden bir selfie yükle. JPG / PNG kabul ediyoruz.
        </p>
        <label
          className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-navy/20 bg-brand-navy/[0.02] px-4 py-5 text-center text-xs font-medium text-brand-navy/70 transition hover:border-brand-orange hover:bg-brand-orange/5 hover:text-brand-navy"
        >
          <span aria-hidden="true" className="text-xl">📁</span>
          <span>Galeriden seç</span>
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={onFileFallback}
            className="sr-only"
            data-testid="file-fallback"
          />
        </label>
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error === "face_count"
            ? "Selfie'de yüz tespit edilemedi ya da birden fazla yüz var."
            : error === "camera_blocked"
            ? "Kameraya erişilemedi. Galeri yüklemeyi deneyin."
            : "Bir hata oluştu."}
        </p>
      )}
      <button
        type="button"
        onClick={() => deleteMyData.mutate()}
        className="self-start text-xs underline text-brand-navy/60 hover:text-red-700"
        data-testid="delete-my-data"
        disabled={!participantId}
      >
        Verimi sil
      </button>
    </div>
  );
}
