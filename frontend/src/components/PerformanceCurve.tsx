import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { Card, Loading } from "./Common";
import { InfoTip } from "./InfoTip";
import { formatCompactINR, formatINR, formatPct } from "../lib/format";
import type { CurvePoint, CurveResult } from "../engine/portfolio/performance";

const VIEWS = [
  { id: "combined" as const, label: "Portfolio" },
  { id: "mf"       as const, label: "Mutual Funds" },
  { id: "equity"   as const, label: "Equity" },
] as const;
type ViewId = typeof VIEWS[number]["id"];

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtMonth(iso: string) {
  const [y, mo] = iso.slice(0, 7).split("-").map(Number);
  return `${MO[mo - 1]} ${y}`;
}

function periodReturn(points: CurvePoint[], lo: string, hi: string): number | null {
  const startPt = points.find((p) => p.date >= lo);
  const endPt   = [...points].reverse().find((p) => p.date <= hi);
  if (!startPt || !endPt || startPt.date === endPt.date) return null;
  return Math.round((endPt.nav / startPt.nav - 1) * 10000) / 100;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CurveTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card p-2.5 text-xs shadow-md">
      <div className="font-medium text-ink mb-1">{p.date}</div>
      <div className={p.return_pct >= 0 ? "text-emerald-600" : "text-rose-600"}>
        Return: {p.return_pct >= 0 ? "+" : ""}{formatPct(p.return_pct)}
      </div>
      <div className="text-ink-soft">Value: {formatINR(p.value)}</div>
      <div className="text-ink-mute">Invested: {formatINR(p.invested)}</div>
    </div>
  );
}

// ── Chart with drag selection ─────────────────────────────────────────────────

function CurveChart({
  series,
  onRangeSelect,
}: {
  series: CurveResult;
  onRangeSelect?: (from: string, to: string) => void;
}) {
  const [hoveredDate, setHoveredDate]   = useState<string | null>(null);
  const [mouseDown,   setMouseDown]     = useState(false);
  const [selectStart, setSelectStart]   = useState<string | null>(null);
  const [selectEnd,   setSelectEnd]     = useState<string | null>(null);

  if (!series.available || !series.points.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-ink-mute">
        {series.note}
      </div>
    );
  }

  const lo = selectStart && selectEnd ? (selectStart <= selectEnd ? selectStart : selectEnd) : null;
  const hi = selectStart && selectEnd ? (selectStart <= selectEnd ? selectEnd : selectStart) : null;
  const pRet = lo && hi ? periodReturn(series.points, lo, hi) : null;

  const clearSelection = () => { setSelectStart(null); setSelectEnd(null); };

  const onMouseDown = () => {
    if (hoveredDate) {
      setMouseDown(true);
      setSelectStart(hoveredDate);
      setSelectEnd(hoveredDate);
    }
  };

  const finalise = () => {
    if (!mouseDown) return;
    setMouseDown(false);
    if (selectStart && selectEnd && selectStart !== selectEnd) {
      const [f, t] = selectStart <= selectEnd ? [selectStart, selectEnd] : [selectEnd, selectStart];
      onRangeSelect?.(f, t);
    } else {
      clearSelection();
    }
  };

  return (
    <div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onMouseDown={onMouseDown}
        onMouseUp={finalise}
        onMouseLeave={finalise}
        style={{ userSelect: "none", cursor: mouseDown ? "col-resize" : "crosshair" }}
      >
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <AreaChart
              data={series.points}
              margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
              onMouseMove={(e: any) => {
                const lbl = e?.activeLabel as string | undefined;
                if (lbl) {
                  setHoveredDate(lbl);
                  if (mouseDown) setSelectEnd(lbl);
                }
              }}
            >
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickFormatter={(d) => d.slice(0, 7)}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickFormatter={(v) => `${v}%`}
                width={44}
              />
              {!mouseDown && <Tooltip content={<CurveTooltip />} />}
              <Area
                type="monotone"
                dataKey="return_pct"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#perfFill)"
                isAnimationActive={false}
              />
              {lo && hi && (
                <ReferenceArea
                  x1={lo}
                  x2={hi}
                  fill="rgba(37, 99, 235, 0.1)"
                  stroke="rgba(37, 99, 235, 0.35)"
                  strokeDasharray="4 2"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selection stats */}
      {lo && hi && pRet !== null && (
        <div className="flex items-center gap-2 mt-2 px-1 text-xs">
          <span className="text-ink-mute">{fmtMonth(lo)} – {fmtMonth(hi)}</span>
          <span className="text-ink-mute">Time-weighted return:</span>
          <span className={`font-semibold ${pRet >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {pRet >= 0 ? "+" : ""}{formatPct(pRet)}
          </span>
          <span className="text-ink-mute text-[10px]">(XIRR in table below is money-weighted — both are correct, can differ)</span>
          <button
            onClick={clearSelection}
            className="ml-auto text-ink-mute hover:text-ink transition-colors"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}
      {lo && hi && pRet === null && (
        <div className="flex items-center gap-2 mt-2 px-1 text-xs text-ink-mute">
          <span>Select a wider range to see period return</span>
          <button onClick={clearSelection} className="ml-auto hover:text-ink transition-colors" title="Clear">✕</button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PerformanceCurve({
  onRangeSelect,
}: {
  onRangeSelect?: (from: string, to: string) => void;
}) {
  const [view, setView] = useState<ViewId>("combined");
  const { data, isLoading } = useQuery({ queryKey: ["performance"], queryFn: api.performance });

  const title = <>Performance <InfoTip term="time_weighted" /></>;

  if (isLoading || !data) {
    return <Card title={title}><Loading /></Card>;
  }

  const series: CurveResult = data[view];
  const final = series.final_return_pct;

  return (
    <Card
      title={title}
      actions={
        series.available ? (
          <div className="text-right">
            <span className={`text-lg font-bold ${final >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {final >= 0 ? "+" : ""}{formatPct(final)}
            </span>
            <span className="text-xs text-ink-mute ml-1">since inception</span>
          </div>
        ) : undefined
      }
    >
      {/* View selector */}
      <div className="flex gap-1.5 mb-4">
        {VIEWS.map((v) => {
          const s: CurveResult = data[v.id];
          const isActive = view === v.id;
          const unavailable = !s.available;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                isActive
                  ? "bg-brand text-white"
                  : unavailable
                  ? "bg-slate-100 text-ink-mute cursor-not-allowed"
                  : "bg-slate-100 text-ink-soft hover:bg-slate-200"
              }`}
              title={unavailable ? s.note : undefined}
            >
              {v.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-ink-mute self-center">drag to select a period</span>
      </div>

      {/* key=view resets drag selection when switching tabs */}
      <CurveChart key={view} series={series} onRangeSelect={onRangeSelect} />

      {series.available && (
        <p className="text-[11px] text-ink-mute mt-2">
          {series.note}
          {" "}Covers {formatPct(series.covered_pct)} of net worth ({formatCompactINR(series.covered_value)}).
        </p>
      )}
    </Card>
  );
}
