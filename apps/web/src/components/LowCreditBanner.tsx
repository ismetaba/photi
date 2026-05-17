import { Link } from "react-router-dom";

interface Props {
  balance: number | null | undefined;
  awaitingCount?: number;
}

const LOW_CREDIT_THRESHOLD = 10;

export function LowCreditBanner({ balance, awaitingCount = 0 }: Props) {
  const value = balance ?? 0;
  if (value >= LOW_CREDIT_THRESHOLD) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b border-brand-orange/40 bg-brand-orange/10 px-4 py-2 text-sm text-brand-navy"
    >
      <span>
        Düşük kredi: <strong>{value} Photi</strong>
        {awaitingCount > 0 && (
          <> · {awaitingCount} fotoğraf kredi bekliyor</>
        )}
      </span>
      <Link
        to="/billing"
        className="rounded-full bg-brand-orange px-3 py-1 text-xs font-semibold text-white"
      >
        Kredi yükle
      </Link>
    </div>
  );
}
