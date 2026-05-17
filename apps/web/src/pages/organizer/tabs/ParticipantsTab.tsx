import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api/client.js";
import { Skeleton } from "../../../components/Skeleton.js";
import { EmptyState } from "../../../components/EmptyState.js";

interface Item {
  id: string;
  userId: string;
  joinedAt: string;
  selfieThumbUrl: string | null;
  matchCount: number;
}

interface Props {
  eventId: string;
}

type SortKey = "joined" | "matches";

export function ParticipantsTab({ eventId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["participants", eventId],
    queryFn: () => api.get<Item[]>(`/events/${eventId}/participants`),
    refetchInterval: 10000,
  });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("joined");

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    const matched = q ? list.filter((p) => p.userId.toLowerCase().includes(q)) : list;
    return [...matched].sort((a, b) =>
      sortKey === "matches"
        ? b.matchCount - a.matchCount
        : new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
    );
  }, [data, query, sortKey]);

  const totalMatches = (data ?? []).reduce((s, p) => s + p.matchCount, 0);
  const selfieCount = (data ?? []).filter((p) => p.selfieThumbUrl).length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="Henüz katılımcı yok"
        description="QR kodunu paylaş, katılımcılar selfie verir vermez burada görünür."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Toplam katılımcı" value={data.length} />
        <Stat label="Selfie veren" value={selfieCount} />
        <Stat label="Toplam eşleşme" value={totalMatches} accent />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kullanıcı ID ile ara…"
          className="flex-1 min-w-[200px] rounded-lg border border-brand-navy/15 bg-white px-3 py-1.5 text-sm placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
        />
        <div className="inline-flex rounded-full border border-brand-navy/10 bg-white p-0.5 text-[11px] font-semibold">
          <SortChip active={sortKey === "joined"} onClick={() => setSortKey("joined")}>Yeni</SortChip>
          <SortChip active={sortKey === "matches"} onClick={() => setSortKey("matches")}>Eşleşme</SortChip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-brand-navy/15 px-4 py-6 text-center text-sm text-brand-navy/60">
          Aramayla eşleşen katılımcı yok.
        </p>
      ) : (
        <ul className="divide-y divide-brand-navy/10 rounded-2xl border border-brand-navy/10 bg-white">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl hover:bg-brand-navy/[0.02]"
              data-testid="participant-row"
            >
              {p.selfieThumbUrl ? (
                <img
                  src={p.selfieThumbUrl}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover ring-1 ring-brand-navy/10"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy/40 text-sm">
                  {p.userId.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-brand-navy">{p.userId.slice(0, 8)}…</p>
                <p className="text-[11px] text-brand-navy/55">
                  {new Date(p.joinedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  p.matchCount > 0
                    ? "bg-brand-orange/10 text-brand-orange"
                    : "bg-brand-navy/5 text-brand-navy/50"
                }`}
              >
                {p.matchCount} eşleşme
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-brand-navy/10 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-navy/55">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${accent ? "text-brand-orange" : "text-brand-navy"}`}>{value}</div>
    </div>
  );
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 transition ${
        active ? "bg-brand-navy text-white" : "text-brand-navy/60 hover:text-brand-navy"
      }`}
    >
      {children}
    </button>
  );
}
