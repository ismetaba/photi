import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { Button } from "../../components/Button.js";
import { Modal } from "../../components/Modal.js";
import { SkeletonGrid } from "../../components/Skeleton.js";
import { useMe } from "../../api/queries.js";

interface BillingPackage {
  id: string;
  photi: number;
  priceTl: number;
  label: string;
}

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

export default function Billing() {
  const me = useMe();
  const qc = useQueryClient();
  const packagesQuery = useQuery({
    queryKey: ["billing", "packages"],
    queryFn: () => api.get<BillingPackage[]>("/billing/packages"),
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<BillingPackage | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");

  const purchase = useMutation({
    mutationFn: async (pkg: BillingPackage) =>
      api.post<{ balance: number }>("/billing/purchase", { packageId: pkg.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      setSelected(null);
      setCardName("");
      setCardNumber("");
    },
  });

  const balance = me.data?.balance ?? 0;
  const packages = packagesQuery.data ?? [];
  const bestValue = packages.reduce(
    (best, pkg) => (best === null || pkg.photi / pkg.priceTl > best.photi / best.priceTl ? pkg : best),
    null as BillingPackage | null,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-navy">Bakiye & paketler</h1>
        <p className="mt-1 text-sm text-brand-navy/60">
          Her dağıtılan fotoğraf 1 Photi düşer. Bakiyen biterse katılımcılar yeni fotoğraf alamaz.
        </p>
      </header>

      <section
        className="relative overflow-hidden rounded-2xl bg-brand-navy p-6 text-white shadow-lg"
        aria-label="Photi bakiyesi"
      >
        <div
          aria-hidden="true"
          className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-brand-orange/30 blur-3xl"
        />
        <div className="relative flex items-center justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Photi bakiyen
            </p>
            <p className="mt-2 flex items-baseline gap-2 text-4xl font-bold">
              {balance.toLocaleString("tr-TR")}
              <span className="text-base font-medium text-white/70">photi</span>
            </p>
            <p className="mt-1 text-xs text-white/55">
              {balance > 0 ? `~${balance} fotoğraf dağıtabilirsin` : "Devam etmek için paket satın al"}
            </p>
          </div>
          <span aria-hidden="true" className="text-5xl">📸</span>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-brand-navy">Paketler</h2>
        {packagesQuery.isLoading ? (
          <div className="mt-3">
            <SkeletonGrid count={3} columns={3} />
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {packages.map((pkg) => {
              const isBest = bestValue?.id === pkg.id;
              const pricePerPhoti = (pkg.priceTl / pkg.photi).toFixed(2);
              return (
                <li
                  key={pkg.id}
                  className={`relative flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    isBest ? "border-brand-orange" : "border-brand-navy/10"
                  }`}
                  data-testid="billing-package"
                >
                  {isBest ? (
                    <span className="absolute -top-2 left-4 inline-flex items-center rounded-full bg-brand-orange px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
                      En avantajlı
                    </span>
                  ) : null}
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-brand-navy">{pkg.photi}</p>
                    <p className="text-sm font-medium text-brand-navy/55">Photi</p>
                  </div>
                  <p className="text-xs text-brand-navy/55">₺{pricePerPhoti} / Photi</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-2xl font-semibold text-brand-navy">₺{pkg.priceTl}</span>
                    <Button
                      type="button"
                      onClick={() => setSelected(pkg)}
                      data-testid={`buy-${pkg.id}`}
                      variant={isBest ? "primary" : "secondary"}
                    >
                      Satın al
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.photi} Photi · ₺${selected.priceTl}` : ""}
      >
        {selected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              purchase.mutate(selected);
            }}
            className="space-y-4"
          >
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
              <span className="font-semibold">Demo ödeme.</span> Gerçek kart bilgisi girme — hiçbir banka ile entegrasyon yok.
            </div>

            <div className="space-y-3">
              <Field label="Kart üzerindeki isim">
                <input
                  required
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
                />
              </Field>
              <Field label="Kart numarası">
                <input
                  required
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  pattern="[0-9 ]{12,}"
                  className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 font-mono text-sm tracking-wider placeholder:text-brand-navy/30 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
                />
              </Field>
            </div>

            {purchase.isError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                Ödeme başarısız oldu. Tekrar dene.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-brand-navy/10 pt-3">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={purchase.isPending} data-testid="confirm-purchase">
                {purchase.isPending ? "İşleniyor…" : `₺${selected.priceTl} öde`}
              </Button>
            </div>
          </form>
        )}
      </Modal>
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
