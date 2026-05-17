import type { CSSProperties, ReactNode } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** Animated shimmer bar — base building block for loading placeholders. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`block animate-pulse rounded-md bg-brand-navy/10 ${className}`}
    />
  );
}

/** Card-shaped skeleton used by event lists / photo grids. */
export function SkeletonCard({ aspect = "aspect-[4/3]" }: { aspect?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-white p-4 ${aspect}`}
    >
      <div className="flex h-full flex-col justify-between">
        <Skeleton className="h-3 w-12" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

/** Drop a row of skeleton cards as a list placeholder. */
export function SkeletonGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  const gridCols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 md:grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" }[columns] ?? "grid-cols-3";
  return (
    <div className={`grid gap-3 ${gridCols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Centered loading message wrapped in a friendly card. */
export function LoadingBlock({ children = "Yükleniyor…" }: { children?: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-brand-navy/15 bg-brand-navy/[0.02] px-6 py-10 text-sm text-brand-navy/60">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-brand-navy/20 border-t-brand-orange"
      />
      <span>{children}</span>
    </div>
  );
}
