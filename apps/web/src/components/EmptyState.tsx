import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  variant?: "card" | "inline";
}

/**
 * Friendly empty-state placeholder used when a list/grid has no items yet.
 * Card variant for full-page slots, inline for smaller slots inside cards.
 */
export function EmptyState({ icon, title, description, action, variant = "card" }: EmptyStateProps) {
  const wrapper =
    variant === "card"
      ? "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-navy/15 bg-white/40 px-6 py-12 text-center"
      : "flex flex-col items-center justify-center gap-2 px-4 py-8 text-center";

  return (
    <div className={wrapper}>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange text-lg"
      >
        {icon ?? "✨"}
      </span>
      <div className="text-base font-semibold text-brand-navy">{title}</div>
      {description ? (
        <p className="max-w-sm text-sm text-brand-navy/60">{description}</p>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Inline error banner — red-tinted, role="alert" for screen readers.
 * Use for recoverable failures (network, validation).
 */
export function ErrorState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <span aria-hidden="true" className="text-base">⚠️</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {description ? <p className="mt-1 text-red-800/85">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
