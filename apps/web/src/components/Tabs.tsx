import { useState, type ReactNode } from "react";

export interface TabSpec {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: TabSpec[];
  initialId?: string;
}

export function Tabs({ tabs, initialId }: Props) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div>
      <div role="tablist" className="flex gap-2 border-b border-brand-navy/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            data-testid={`tab-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
              t.id === active
                ? "border-brand-orange text-brand-orange"
                : "border-transparent text-brand-navy/70 hover:text-brand-navy"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-6">
        {current.content}
      </div>
    </div>
  );
}
