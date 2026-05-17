import { Link } from "react-router-dom";
import { useMyEvents } from "../../api/queries.js";
import { SkeletonGrid } from "../../components/Skeleton.js";
import { EmptyState, ErrorState } from "../../components/EmptyState.js";

const STATUS_LABEL = {
  draft: "Taslak",
  live: "Canlı",
  archived: "Arşiv",
} as const;

const STATUS_TONE = {
  draft: "bg-amber-50 text-amber-700 ring-amber-200",
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  archived: "bg-brand-navy/5 text-brand-navy/60 ring-brand-navy/15",
} as const;

function formatRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`
    : `${dateFmt.format(start)} → ${dateFmt.format(end)}`;
}

export default function Home() {
  const { data, isLoading, error } = useMyEvents();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Etkinliklerin</h1>
          <p className="mt-1 text-sm text-brand-navy/60">
            Oluşturduğun her etkinlik için kart paylaş, fotoğrafları yüz tanıma ile katılımcılara dağıt.
          </p>
        </div>
      </header>

      {isLoading ? (
        <SkeletonGrid count={3} columns={3} />
      ) : error ? (
        <ErrorState title="Etkinlikler yüklenemedi" description="Backend'e ulaşılamıyor. Birkaç saniye sonra tekrar dene." />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Henüz etkinliğin yok"
          description="İlk etkinliğini oluştur, QR ile katılımcı davet et. Selfie veren herkes kendi fotoğraflarını anında görür."
          action={
            <Link
              to="/events/new"
              className="inline-flex items-center rounded-full bg-brand-orange px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-orange/90"
            >
              + İlk etkinliği oluştur
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="events-list">
          {data.map((event) => {
            const status = (event.status ?? "draft") as keyof typeof STATUS_LABEL;
            return (
              <li
                key={event.id}
                className="group relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link to={`/events/${event.id}`} className="flex h-full flex-col">
                  <div
                    aria-hidden="true"
                    className="h-24 w-full"
                    style={{
                      background: event.brandingColor
                        ? `linear-gradient(135deg, ${event.brandingColor}, color-mix(in srgb, ${event.brandingColor} 55%, #000))`
                        : "linear-gradient(135deg, #FF6A1A, #0F1B3D)",
                    }}
                  />
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-base font-semibold text-brand-navy">{event.title}</h3>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_TONE[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                    {event.startsAt && event.endsAt ? (
                      <p className="text-xs text-brand-navy/55">{formatRange(event.startsAt, event.endsAt)}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
