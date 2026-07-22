import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import { formatINR, formatPct, signClass } from "../lib/format";

type Preset = { label: string; from?: string; to?: string };

function fy(startYear: number): Preset {
  return { label: `FY ${startYear}-${String(startYear + 1).slice(2)}`, from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function buildPresets(): Preset[] {
  const today = new Date();
  const y = today.getFullYear();
  const oneYearAgo = new Date(today); oneYearAgo.setFullYear(y - 1);
  const currentFyStart = today.getMonth() >= 3 ? y : y - 1;
  return [
    { label: "Lifetime" }, // no from/to → lifetime
    { label: "1 Year", from: iso(oneYearAgo), to: iso(today) },
    fy(currentFyStart),
    fy(currentFyStart - 1),
    { label: "Jun–Dec 2025", from: "2025-06-01", to: "2025-12-31" },
  ];
}

const SCOPES = [
  { id: "portfolio", label: "Whole portfolio" },
  { id: "asset_class", label: "By asset class" },
  { id: "instrument", label: "By holding" },
];

const FLAG_LABELS: Record<string, string> = {
  price_return_only: "price-return (excl. dividends)",
  has_estimated_price: "partial coverage",
  split_flagged: "split in window",
  insufficient_data: "no cost-basis data",
};

export default function Analytics() {
  const presets = useMemo(buildPresets, []);
  const [preset, setPreset] = useState<Preset>(presets[0]);
  const [scope, setScope] = useState("asset_class");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);

  const range = custom ?? { from: preset.from, to: preset.to };
  const { data, isLoading } = useQuery({
    queryKey: ["xirr", scope, range.from, range.to],
    queryFn: () => api.xirr(scope, range.from, range.to),
  });

  return (
    <>
      <PageHeader
        title="Analytics — XIRR"
        subtitle="Money-weighted annualized returns over any period. Mutual-fund figures use actual NAV; direct equity needs a price feed (coming with Kite)."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <div className="stat-label mb-1.5">Period</div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setPreset(p); setCustom(null); }}
                  className={`px-2.5 py-1 rounded-lg text-sm ${!custom && preset.label === p.label ? "bg-brand text-white" : "bg-slate-100 text-ink-soft hover:bg-slate-200"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="stat-label mb-1.5">Custom range</div>
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={custom?.from ?? ""} onChange={(e) => setCustom({ from: e.target.value, to: custom?.to ?? iso(new Date()) })}
                className="border border-slate-200 rounded-lg px-2 py-1" />
              <span className="text-ink-mute">→</span>
              <input type="date" value={custom?.to ?? ""} onChange={(e) => setCustom({ from: custom?.from ?? "2020-01-01", to: e.target.value })}
                className="border border-slate-200 rounded-lg px-2 py-1" />
            </div>
          </div>

          <div>
            <div className="stat-label mb-1.5">Group by</div>
            <div className="flex gap-1.5">
              {SCOPES.map((s) => (
                <button key={s.id} onClick={() => setScope(s.id)}
                  className={`px-2.5 py-1 rounded-lg text-sm ${scope === s.id ? "bg-brand text-white" : "bg-slate-100 text-ink-soft hover:bg-slate-200"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading || !data ? (
          <Loading />
        ) : (
          <>
            <div className="text-sm text-ink-mute mb-3">
              {data.is_period ? `Period XIRR ${range.from} → ${range.to}` : "Lifetime XIRR (since first transaction)"}
            </div>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{scope === "instrument" ? "Holding" : scope === "asset_class" ? "Asset class" : "Portfolio"}</th>
                    <th className="text-right">XIRR</th>
                    <th className="text-right">Current value</th>
                    <th className="text-right">Invested</th>
                    <th className="text-right">XIRR coverage</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.label}>
                      <td className="font-medium max-w-[280px] truncate" title={r.label}>{r.label}</td>
                      <td className={`text-right tabular-nums font-semibold ${r.xirr === null ? "text-ink-mute" : signClass(r.xirr)}`}>
                        {r.xirr === null ? "—" : formatPct(r.xirr)}
                      </td>
                      <td className="text-right tabular-nums">{formatINR(r.current_value)}</td>
                      <td className="text-right tabular-nums text-ink-soft">{formatINR(r.invested)}</td>
                      <td className="text-right tabular-nums">
                        <CoverageBar pct={r.coverage_pct} />
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(r.flags).filter(([, v]) => v).map(([k]) => (
                            <span key={k} className="pill bg-amber-100 text-amber-700" title={FLAG_LABELS[k]}>{FLAG_LABELS[k] ?? k}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-mute mt-3">{data.note}</p>
          </>
        )}
      </Card>
    </>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-ink-mute w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}
