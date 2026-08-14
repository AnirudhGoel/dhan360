import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import { formatINR, formatPct, signClass } from "../lib/format";
import { DEMO } from "../lib/demo";
import PerformanceCurve from "../components/PerformanceCurve";
import { InfoTip } from "../components/InfoTip";

// ── Slider helpers ────────────────────────────────────────────────────────────
const SLIDER_BASE = "2010-01"; // earliest selectable month

const iso = (d: Date) => d.toISOString().slice(0, 10);

function toMonthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthIdx(m: string): number {
  const [y, mo] = m.split("-").map(Number);
  return (y - 2010) * 12 + (mo - 1);
}
function idxToMonth(i: number): string {
  const y = 2010 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[mo - 1]} ${y}`;
}
function lastDayOf(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return iso(new Date(y, mo, 0));
}

// ── Preset helpers ────────────────────────────────────────────────────────────
type Preset = { label: string; from?: string; to?: string };

function fy(startYear: number): Preset {
  return {
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

function buildPresets(): Preset[] {
  if (DEMO) {
    return [
      { label: "Lifetime" },
      { label: "Jun–Dec 2025", from: "2025-06-01", to: "2025-12-31" },
    ];
  }
  const today = new Date();
  const y = today.getFullYear();
  const currentFyStart = today.getMonth() >= 3 ? y : y - 1;
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(y - 1);
  return [
    { label: "Lifetime" },
    { label: "1 Year", from: `${toMonthStr(oneYearAgo)}-01`, to: iso(today) },
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
  insufficient_data: "snapshot — no dated transactions",
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const presets = useMemo(buildPresets, []);
  const [activeLabel, setActiveLabel] = useState<string>("Lifetime");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [scope, setScope] = useState("asset_class");

  const { data, isLoading } = useQuery({
    queryKey: ["xirr", scope, from, to],
    queryFn: () => api.xirr(scope, from ?? undefined, to ?? undefined),
  });

  const handlePreset = (p: Preset) => {
    setFrom(p.from ?? null);
    setTo(p.to ?? null);
    setActiveLabel(p.label);
  };

  const handleSlider = (newFrom: string | null, newTo: string | null) => {
    setFrom(newFrom);
    setTo(newTo);
    setActiveLabel(newFrom === null && newTo === null ? "Lifetime" : "Custom");
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Performance curve and money-weighted (XIRR) returns. Mutual-fund figures use actual NAV; equity uses price-return (dividends excluded)."
      />

      <div className="mb-4">
        <PerformanceCurve />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="stat-label mb-1.5">Period</div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p)}
                    className={`px-2.5 py-1 rounded-lg text-sm ${
                      activeLabel === p.label
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-ink-soft hover:bg-slate-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {activeLabel === "Custom" && (
                  <span className="px-2.5 py-1 rounded-lg text-sm bg-brand text-white">Custom</span>
                )}
              </div>
            </div>

            <div>
              <div className="stat-label mb-1.5">Group by</div>
              <div className="flex gap-1.5">
                {SCOPES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setScope(s.id)}
                    className={`px-2.5 py-1 rounded-lg text-sm ${
                      scope === s.id ? "bg-brand text-white" : "bg-slate-100 text-ink-soft hover:bg-slate-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!DEMO && <DateRangeSlider from={from} to={to} onChange={handleSlider} />}
        </div>
      </Card>

      <Card>
        {isLoading || !data ? (
          <Loading />
        ) : (
          <>
            <div className="text-sm text-ink-mute mb-3">
              {data.is_period
                ? `Period XIRR ${from} → ${to}`
                : "Lifetime XIRR (since first transaction)"}
            </div>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>
                      {scope === "instrument"
                        ? "Holding"
                        : scope === "asset_class"
                        ? "Asset class"
                        : "Portfolio"}
                    </th>
                    <th className="text-right">
                      <span className="inline-flex items-center justify-end">
                        XIRR<InfoTip term="xirr" />
                      </span>
                    </th>
                    <th className="text-right">Current value</th>
                    <th className="text-right">Invested</th>
                    <th className="text-right">
                      <span className="inline-flex items-center justify-end">
                        XIRR coverage<InfoTip term="coverage" />
                      </span>
                    </th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.label}>
                      <td className="font-medium max-w-[280px] truncate" title={r.label}>
                        {r.label}
                      </td>
                      <td
                        className={`text-right tabular-nums font-semibold ${
                          r.xirr === null ? "text-ink-mute" : signClass(r.xirr)
                        }`}
                      >
                        {r.xirr === null ? "—" : formatPct(r.xirr)}
                      </td>
                      <td className="text-right tabular-nums">{formatINR(r.current_value)}</td>
                      <td className="text-right tabular-nums text-ink-soft">{formatINR(r.invested)}</td>
                      <td className="text-right tabular-nums">
                        <CoverageBar pct={r.coverage_pct} />
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(r.flags)
                            .filter(([, v]) => v)
                            .map(([k]) => (
                              <span
                                key={k}
                                className="pill bg-amber-100 text-amber-700"
                                title={FLAG_LABELS[k]}
                              >
                                {FLAG_LABELS[k] ?? k}
                              </span>
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

// ── DateRangeSlider ───────────────────────────────────────────────────────────
function DateRangeSlider({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const todayM = toMonthStr(new Date());
  const maxIdx = monthIdx(todayM);
  const fromM = from ? from.slice(0, 7) : SLIDER_BASE;
  const toM = to ? to.slice(0, 7) : todayM;
  const fromIdx = Math.max(0, Math.min(monthIdx(fromM), maxIdx - 1));
  const toIdx = Math.max(1, Math.min(monthIdx(toM), maxIdx));
  const isLifetime = fromIdx === 0 && toIdx === maxIdx;
  const pctFrom = (fromIdx / maxIdx) * 100;
  const pctTo = (toIdx / maxIdx) * 100;

  const emitFrom = (i: number) => {
    const clamped = Math.max(0, Math.min(i, toIdx - 1));
    if (clamped === 0 && toIdx === maxIdx) return onChange(null, null);
    onChange(`${idxToMonth(clamped)}-01`, to ?? lastDayOf(todayM));
  };

  const emitTo = (i: number) => {
    const clamped = Math.max(fromIdx + 1, Math.min(i, maxIdx));
    if (fromIdx === 0 && clamped === maxIdx) return onChange(null, null);
    onChange(from ?? `${SLIDER_BASE}-01`, lastDayOf(idxToMonth(clamped)));
  };

  return (
    <>
      <style>{`
        .drs input[type=range] {
          -webkit-appearance: none; appearance: none;
          position: absolute; width: 100%; height: 100%;
          background: transparent; pointer-events: none;
          margin: 0; padding: 0; top: 0; left: 0;
        }
        .drs input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: white; border: 2px solid #2563eb;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          cursor: pointer; pointer-events: all;
          transition: transform 0.1s;
        }
        .drs input[type=range]:hover::-webkit-slider-thumb,
        .drs input[type=range]:focus::-webkit-slider-thumb {
          transform: scale(1.15);
        }
        .drs input[type=range]::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: white; border: 2px solid #2563eb;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          cursor: pointer; pointer-events: all;
        }
      `}</style>
      <div>
        <div className="stat-label mb-2">Timeline</div>
        <div className="drs relative h-5 mb-2 select-none">
          {/* Track background */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
          {/* Filled portion between handles */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-brand rounded-full"
            style={{ left: `${pctFrom}%`, right: `${100 - pctTo}%` }}
          />
          {/* Left (from) handle */}
          <input
            type="range"
            min={0}
            max={maxIdx}
            value={fromIdx}
            onChange={(e) => emitFrom(Number(e.target.value))}
            style={{ zIndex: fromIdx >= toIdx - 1 ? 5 : 3 }}
          />
          {/* Right (to) handle */}
          <input
            type="range"
            min={0}
            max={maxIdx}
            value={toIdx}
            onChange={(e) => emitTo(Number(e.target.value))}
            style={{ zIndex: 4 }}
          />
        </div>
        <div className="flex justify-between text-xs text-ink-mute">
          <span>{isLifetime ? "All time" : monthLabel(idxToMonth(fromIdx))}</span>
          <span>{isLifetime ? "today" : monthLabel(idxToMonth(toIdx))}</span>
        </div>
      </div>
    </>
  );
}

// ── CoverageBar ───────────────────────────────────────────────────────────────
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
