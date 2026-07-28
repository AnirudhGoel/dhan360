import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import { formatINR } from "../lib/format";
import { ASSET_COLORS } from "../lib/colors";

const KIND_STYLES: Record<string, string> = {
  buy: "bg-emerald-100 text-emerald-700",
  sell: "bg-rose-100 text-rose-700",
  dividend: "bg-sky-100 text-sky-700",
  switch_in: "bg-emerald-100 text-emerald-700",
  switch_out: "bg-amber-100 text-amber-700",
};

const SOURCE_LABELS: Record<string, string> = {
  cas_pdf: "CAS (PDF)",
  cas_json: "CAS (JSON)",
  zerodha_tradebook: "Zerodha tradebook",
  zerodha_holdings: "Zerodha holdings",
  generic_csv: "CSV import",
  manual: "Manual entry",
};

export default function Transactions() {
  const { data, isLoading } = useQuery({ queryKey: ["transactions"], queryFn: api.transactions });
  const [kind, setKind] = useState("all");
  const [assetClass, setAssetClass] = useState("all");
  const [q, setQ] = useState("");

  const rows = data?.transactions ?? [];
  const assetClasses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.asset_class))).sort(),
    [rows]
  );
  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);

  const filtered = rows.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (assetClass === "all" || r.asset_class === assetClass) &&
      (!q || r.instrument.toLowerCase().includes(q.toLowerCase()) || (r.symbol ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  if (isLoading || !data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${data.count} dated cashflows across all sources — the raw material behind XIRR and cost basis.`}
      />

      {data.count === 0 ? (
        <Card>
          <div className="text-center py-10 text-sm text-ink-mute">
            No transactions yet. Import a mutual-fund CAS or a Zerodha tradebook, or add a manual asset
            with a start date, to populate dated cashflows.
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <Stat label="Transactions" value={String(data.count)} />
            <Stat label="Total invested (out)" value={formatINR(data.total_invested_out)} />
            <Stat label="Redemptions / income (in)" value={formatINR(data.total_in)} />
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                placeholder="Search instrument…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 flex-1 min-w-[160px]"
              />
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
                <option value="all">All types</option>
                {kinds.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
              </select>
              <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
                <option value="all">All asset classes</option>
                {assetClasses.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="text-xs text-ink-mute ml-auto">{filtered.length} shown</span>
            </div>

            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Instrument</th>
                    <th>Type</th>
                    <th className="text-right">Units</th>
                    <th className="text-right">Amount</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td className="text-ink-mute tabular-nums">{t.date}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ASSET_COLORS[t.asset_class] ?? "#cbd5e1" }} />
                          <span className="font-medium max-w-[240px] truncate" title={t.instrument}>{t.instrument}</span>
                        </div>
                        <div className="text-[11px] text-ink-mute pl-3.5">{t.symbol ?? ""}{t.account ? ` · ${t.account}` : ""}</div>
                      </td>
                      <td><span className={`pill ${KIND_STYLES[t.kind] ?? "bg-slate-100 text-slate-600"}`}>{t.kind.replace("_", " ")}</span></td>
                      <td className="text-right tabular-nums text-ink-soft">{t.units !== null ? t.units.toLocaleString("en-IN") : "—"}</td>
                      <td className={`text-right tabular-nums font-medium ${t.direction === "out" ? "text-ink" : "text-emerald-600"}`}>
                        {t.direction === "out" ? formatINR(Math.abs(t.amount)) : `+${formatINR(t.amount)}`}
                      </td>
                      <td className="text-ink-mute">{SOURCE_LABELS[t.source] ?? t.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div className="text-xl font-bold text-ink mt-1 tabular-nums">{value}</div>
    </div>
  );
}
