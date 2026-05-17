import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { Tabs } from "../../components/Tabs.js";
import { PhotosTab } from "./tabs/PhotosTab.js";
import { ParticipantsTab } from "./tabs/ParticipantsTab.js";
import { SettingsTab } from "./tabs/SettingsTab.js";
import { QrTab } from "./tabs/QrTab.js";
import { Skeleton } from "../../components/Skeleton.js";
import { ErrorState } from "../../components/EmptyState.js";
import type { EventListItem } from "../../api/queries.js";

const STATUS_LABEL: Record<string, string> = { draft: "Taslak", live: "Canlı", archived: "Arşiv" };
const STATUS_TONE: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 ring-amber-200",
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  archived: "bg-brand-navy/5 text-brand-navy/60 ring-brand-navy/15",
};

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<EventListItem[]>("/events/mine"),
  });
  const event = data?.find((e) => e.id === id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (error || !event) {
    return <ErrorState title="Etkinlik bulunamadı" description="Bu etkinlik mevcut değil ya da silinmiş olabilir." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-brand-navy">{event.title}</h1>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ring-1 ${STATUS_TONE[event.status] ?? STATUS_TONE.draft!}`}
        >
          {STATUS_LABEL[event.status] ?? event.status}
        </span>
      </header>
      <Tabs
        tabs={[
          {
            id: "photos",
            label: "Fotoğraflar",
            content: <PhotosTab eventId={event.id} />,
          },
          {
            id: "participants",
            label: "Katılımcılar",
            content: <ParticipantsTab eventId={event.id} />,
          },
          {
            id: "settings",
            label: "Ayarlar",
            content: <SettingsTab event={event} />,
          },
          {
            id: "qr",
            label: "QR",
            content: <QrTab event={event} />,
          },
        ]}
      />
    </div>
  );
}
