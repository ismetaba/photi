import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
  brandingColor: string;
  brandingLogoUrl?: string | null;
  coverImageUrl?: string | null;
  status: "draft" | "live" | "archived";
}

export function ParticipantLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { data: event } = useQuery({
    queryKey: ["events", "public", slug],
    queryFn: () => api.get<PublicEvent>(`/events/${slug}`),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  const brandingColor = event?.brandingColor ?? "#FF6A1A";

  return (
    <div
      className="flex min-h-full flex-col bg-white text-brand-navy"
      style={{ "--event-color": brandingColor } as React.CSSProperties}
      data-testid="participant-layout"
    >
      <header
        className="border-b px-4 py-3"
        style={{ borderColor: "color-mix(in srgb, var(--event-color) 30%, transparent)" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <span className="text-lg font-bold" style={{ color: "var(--event-color)" }}>
            {event?.title ?? "Photi"}
          </span>
          {event?.brandingLogoUrl && (
            <img
              src={event.brandingLogoUrl}
              alt=""
              className="h-8 w-auto rounded"
            />
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
