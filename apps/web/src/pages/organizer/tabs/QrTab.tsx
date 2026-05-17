import { useEffect, useState } from "react";
import { Button } from "../../../components/Button.js";
import type { EventListItem } from "../../../api/queries.js";
import { getOrCreateUserId } from "../../../lib/userId.js";

interface Props {
  event: EventListItem;
}

const apiBase = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "http://localhost:3000";
const publicBase = (import.meta.env?.VITE_PUBLIC_BASE as string | undefined) ?? window.location.origin;

export function QrTab({ event }: Props) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;
    fetch(`${apiBase}/events/${event.id}/qr`, {
      headers: { "x-user-id": getOrCreateUserId() },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);
        setQrUrl(createdUrl);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [event.id]);

  const shareLink = `${publicBase.replace(/\/$/, "")}/e/${event.slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {qrUrl ? (
        <img src={qrUrl} alt="QR kodu" className="h-64 w-64" />
      ) : (
        <div className="h-64 w-64 animate-pulse rounded-lg bg-brand-navy/10" />
      )}
      <div className="flex items-center gap-2 rounded-full bg-brand-navy/5 px-3 py-1 text-sm">
        <code className="truncate" data-testid="share-link">{shareLink}</code>
        <Button type="button" variant="ghost" onClick={copy}>
          {copied ? "Kopyalandı" : "Kopyala"}
        </Button>
      </div>
      {qrUrl && (
        <a
          href={qrUrl}
          download={`${event.slug}.png`}
          className="text-sm font-semibold text-brand-orange hover:underline"
        >
          PNG indir
        </a>
      )}
    </div>
  );
}
