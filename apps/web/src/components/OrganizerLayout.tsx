import { Link, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../api/queries.js";
import { BalanceBadge } from "./BalanceBadge.js";
import { LowCreditBanner } from "./LowCreditBanner.js";

export function OrganizerLayout() {
  const { data } = useMe();
  const balance = data?.balance ?? 0;
  const location = useLocation();
  const isOnNew = location.pathname === "/events/new";

  return (
    <div className="flex min-h-full flex-col bg-white text-brand-navy">
      <header className="flex items-center justify-between border-b border-brand-navy/10 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-brand-navy">
          <span aria-hidden className="text-xl">📸</span>
          <span className="text-lg font-bold">Photi</span>
        </Link>
        <div className="flex items-center gap-3">
          <BalanceBadge balance={balance} />
          {!isOnNew && (
            <Link
              to="/events/new"
              className="rounded-full bg-brand-orange px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
            >
              + Yeni Etkinlik
            </Link>
          )}
        </div>
      </header>
      <LowCreditBanner balance={balance} />
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
