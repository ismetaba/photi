import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client.js";
import { Button } from "../../components/Button.js";
import type { EventListItem } from "../../api/queries.js";

const COLOR_PRESETS = [
  "#FF6A1A", // brand orange
  "#E91E63", // pink
  "#9C27B0", // purple
  "#3F51B5", // indigo
  "#2196F3", // blue
  "#009688", // teal
  "#4CAF50", // green
  "#FF9800", // amber
  "#795548", // brown
  "#607D8B", // blue-grey
];

export default function NewEvent() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]!);
  const [logoUrl, setLogoUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: {
      title: string;
      startsAt: string;
      endsAt: string;
      brandingColor: string;
      brandingLogoUrl?: string;
      coverImageUrl?: string;
    }) => api.post<EventListItem>("/events", input),
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: ["events", "mine"] });
      navigate(`/events/${event.id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.code : "create_failed");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      title,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      brandingColor: color,
      brandingLogoUrl: logoUrl ? logoUrl : undefined,
      coverImageUrl: coverImageUrl ? coverImageUrl : undefined,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-brand-navy">Yeni etkinlik</h1>
        <p className="mt-1 text-sm text-brand-navy/60">
          Etkinlik adını ve zamanını gir; markanı temsil eden bir renk seç. Sonradan da düzenleyebilirsin.
        </p>
      </header>

      {/* Live preview card */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-brand-navy/10 bg-white shadow-sm"
      >
        <div
          className="flex h-28 items-end justify-between px-5 py-4 text-white"
          style={{
            background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`,
          }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">Önizleme</div>
            <div className="mt-1 truncate text-xl font-bold">{title || "Etkinlik adı"}</div>
          </div>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-12 w-12 rounded-full bg-white/20 object-cover backdrop-blur" />
          ) : null}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm"
        aria-label="Yeni etkinlik formu"
      >
        <Field label="Başlık">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn. Lise Mezuniyet Töreni"
            className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            data-testid="title-input"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlangıç">
            <DateTimeInput value={startsAt} onChange={setStartsAt} testId="starts-input" />
          </Field>
          <Field label="Bitiş">
            <DateTimeInput value={endsAt} onChange={setEndsAt} testId="ends-input" />
          </Field>
        </div>

        <Field label="Marka rengi">
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((preset) => {
              const active = color.toLowerCase() === preset.toLowerCase();
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  aria-label={preset}
                  aria-pressed={active}
                  className={`relative h-8 w-8 shrink-0 rounded-full ring-offset-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                    active ? "ring-2 ring-brand-navy" : ""
                  }`}
                  style={{ background: preset }}
                >
                  {active ? (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-white text-sm">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
            <label className="ml-1 inline-flex items-center gap-2 rounded-full border border-dashed border-brand-navy/20 px-3 py-1 text-xs text-brand-navy/60 hover:border-brand-orange hover:text-brand-navy">
              <span aria-hidden="true">🎨</span>
              <span>Özel</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="sr-only"
                data-testid="color-input"
              />
            </label>
            <span className="ml-auto font-mono text-xs text-brand-navy/50">{color.toUpperCase()}</span>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kapak görseli URL (opsiyonel)">
            <input
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://"
              className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
              data-testid="cover-input"
            />
          </Field>
          <Field label="Logo URL (opsiyonel)">
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://"
              className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            />
          </Field>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
            {error === "create_failed" ? "Etkinlik oluşturulamadı. Tekrar dene." : error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-brand-navy/10 pt-4">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            İptal
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Oluşturuluyor…" : "Oluştur"}
          </Button>
        </div>
      </form>
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

function DateTimeInput({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="relative">
      <input
        required
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
        data-testid={testId}
      />
    </div>
  );
}
