import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { Button } from "../../components/Button.js";
import { Skeleton } from "../../components/Skeleton.js";
import { EmptyState } from "../../components/EmptyState.js";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
  brandingColor: string;
  brandingLogoUrl?: string | null;
  coverImageUrl?: string | null;
  status: "draft" | "live" | "archived";
  startsAt: string;
  endsAt: string;
}

export default function EventLanding() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const eventQuery = useQuery({
    queryKey: ["events", "public", slug],
    queryFn: () => api.get<PublicEvent>(`/events/${slug}`),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });
  const join = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/events/${slug}/join`),
    onSuccess: () => navigate(`/e/${slug}/selfie`),
  });

  if (eventQuery.isLoading) {
    return (
      <div className="flex flex-col items-center gap-6 text-center" data-testid="event-landing-loading">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
    );
  }
  if (eventQuery.error || !eventQuery.data) {
    return (
      <EmptyState
        icon="🔍"
        title="Etkinlik bulunamadı"
        description="Bu bağlantı geçersiz ya da etkinlik artık aktif değil. Davet bağlantını tekrar kontrol et."
      />
    );
  }
  const event = eventQuery.data;
  const status =
    event.status === "live"
      ? "Şu an canlı"
      : event.status === "draft"
        ? "Henüz başlamadı"
        : "Sona erdi";

  return (
    <div className="flex flex-col items-center gap-6 text-center" data-testid="event-landing">
      {event.coverImageUrl ? (
        <img
          src={event.coverImageUrl}
          alt=""
          className="h-48 w-full rounded-2xl object-cover shadow-sm"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-48 w-full items-center justify-center rounded-2xl text-5xl text-white/90 shadow-sm"
          style={{
            background: `linear-gradient(135deg, var(--event-color), color-mix(in srgb, var(--event-color) 60%, #000))`,
          }}
        >
          📸
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/70 ring-1 ring-brand-navy/10">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${event.status === "live" ? "animate-pulse bg-emerald-500" : "bg-brand-navy/30"}`}
          />
          {status}
        </span>
        <h1 className="text-3xl font-bold leading-tight" style={{ color: "var(--event-color)" }}>
          {event.title}
        </h1>
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-brand-navy/70">
        Yüz tanıma ile yalnızca senin göründüğün fotoğraflar galerine düşer.
        Tek yapman gereken bir selfie çekmek.
      </p>
      <Button
        type="button"
        onClick={() => join.mutate()}
        disabled={join.isPending}
        data-testid="join-button"
        className="px-8"
      >
        {join.isPending ? "Kaydediliyor…" : "Katıl"}
      </Button>
      {join.isError && (
        <p role="alert" className="text-sm text-red-700">
          Katılım başarısız. Tekrar dene.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-brand-navy/45">
        Selfie'n cihazından dışarı çıkmaz. İstediğin an verini silebilirsin.
      </p>
    </div>
  );
}
