interface Props {
  balance: number | null | undefined;
}

export function BalanceBadge({ balance }: Props) {
  return (
    <div
      role="status"
      aria-label={`Photi bakiyesi: ${balance ?? 0}`}
      className="inline-flex items-center gap-2 rounded-full bg-brand-orange/10 px-3 py-1 text-sm font-semibold text-brand-orange"
    >
      <span aria-hidden className="text-base">📸</span>
      <span>{balance ?? 0} Photi</span>
    </div>
  );
}
