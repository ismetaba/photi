import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client.js";
import { Button } from "../../../components/Button.js";
import type { EventListItem } from "../../../api/queries.js";
import type { PhotoListItem } from "./PhotosTab.js";

interface Props {
  event: EventListItem;
}

const COLOR_PRESETS = [
  "#FF6A1A", "#E91E63", "#9C27B0", "#3F51B5", "#2196F3",
  "#009688", "#4CAF50", "#FF9800", "#795548", "#607D8B",
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  live: "Canlı",
  archived: "Arşiv",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 ring-amber-200",
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  archived: "bg-brand-navy/5 text-brand-navy/60 ring-brand-navy/15",
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SettingsTab({ event }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(event.title);
  const [color, setColor] = useState(event.brandingColor);
  const [startsAt, setStartsAt] = useState(toLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(event.endsAt));
  const [coverImageUrl, setCoverImageUrl] = useState(event.coverImageUrl ?? "");

  const photos = useQuery({
    queryKey: ["photos", event.id, "settings-summary"],
    queryFn: () =>
      api.get<{ items: PhotoListItem[]; nextCursor: string | null }>(
        `/events/${event.id}/photos?limit=200`,
      ),
  });
  const readyCount = photos.data?.items.filter((p) => p.status === "ready").length ?? 0;

  const save = useMutation({
    mutationFn: () =>
      api.patch<EventListItem>(`/events/${event.id}`, {
        title,
        brandingColor: color,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        coverImageUrl: coverImageUrl || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", "mine"] }),
  });

  const publish = useMutation({
    mutationFn: () => api.post<EventListItem>(`/events/${event.id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", "mine"] }),
  });
  const archive = useMutation({
    mutationFn: () => api.post<EventListItem>(`/events/${event.id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", "mine"] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-5 rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b border-brand-navy/10 pb-3">
          <h2 className="text-base font-semibold text-brand-navy">Etkinlik ayarları</h2>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_TONE[event.status] ?? STATUS_TONE.draft!}`}
          >
            {STATUS_LABEL[event.status] ?? event.status}
          </span>
        </div>

        <Field label="Başlık">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlangıç">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            />
          </Field>
          <Field label="Bitiş">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            />
          </Field>
        </div>

        <Field label="Marka rengi">
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((p) => {
              const active = color.toLowerCase() === p.toLowerCase();
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setColor(p)}
                  aria-label={p}
                  aria-pressed={active}
                  className={`relative h-7 w-7 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${active ? "ring-2 ring-brand-navy ring-offset-2" : ""}`}
                  style={{ background: p }}
                >
                  {active ? <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-white text-xs">✓</span> : null}
                </button>
              );
            })}
            <label className="ml-1 inline-flex items-center gap-2 rounded-full border border-dashed border-brand-navy/20 px-3 py-1 text-xs text-brand-navy/60 hover:border-brand-orange">
              <span aria-hidden="true">🎨</span>
              <span>Özel</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="sr-only" />
            </label>
            <span className="ml-auto font-mono text-xs text-brand-navy/50">{color.toUpperCase()}</span>
          </div>
        </Field>

        <Field label="Kapak görseli URL">
          <input
            type="url"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="https://"
            className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            data-testid="cover-input"
          />
        </Field>

        {save.isError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            Kaydedilemedi. Tekrar dene.
          </div>
        )}

        <div className="flex items-center justify-end border-t border-brand-navy/10 pt-4">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </form>

      <aside className="space-y-4 rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-brand-navy">Yayın</h2>
          <p className="mt-1 text-xs text-brand-navy/55">
            Hazır fotoğrafların katılımcılara açılması için etkinliği yayımla.
          </p>
        </div>

        <div className="rounded-xl bg-brand-navy/[0.03] p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-brand-navy/65">Hazır fotoğraf</span>
            <span className={`font-mono text-base font-semibold ${readyCount === 0 ? "text-brand-navy/40" : "text-brand-navy"}`}>
              {readyCount}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => publish.mutate()}
            disabled={readyCount === 0 || event.status === "live" || publish.isPending}
            data-testid="publish-button"
          >
            {publish.isPending ? "Yayımlanıyor…" : event.status === "live" ? "Zaten canlı" : "Yayımla"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => archive.mutate()}
            disabled={event.status === "archived" || archive.isPending}
          >
            {archive.isPending ? "Arşivleniyor…" : "Arşivle"}
          </Button>
        </div>

        {readyCount === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            En az bir fotoğraf yüklenip hazır duruma gelene kadar yayımlayamazsın.
          </p>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-navy/60">{label}</span>
      {children}
    </label>
  );
}
