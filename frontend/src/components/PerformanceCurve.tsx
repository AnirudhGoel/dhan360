import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { Card, Loading } from "./Common";
import { InfoTip } from "./InfoTip";
import { formatCompactINR, formatINR, formatPct } from "../lib/format";
import type { CurveResult } from "../engine/portfolio/performance";

const VIEWS = [
  { id: "combined" as const, label: "Portfolio" },
  { id: "mf"       as const, label: "Mutual Funds" },
  { id: "equity"   as const, label: "Equity" },
] as const;
type ViewId = typeof VIEWS[number]["id"];

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

function CurveChart({ series }: { series: CurveResult }) {
  if (!series.available || !series.points.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-ink-mute">
        {series.note}
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <AreaChart data={series.points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip content={<CurveTooltip />} />
          <Area
            type="monotone"
            dataKey="return_pct"
            stroke="#2563eb"
            strokeWidth={2}
            fill="url(#perfFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PerformanceCurve() {
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
          const unavailable = !s.available && !s.points.length;
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
      </div>

      <CurveChart series={series} />

      {series.available && (
        <p className="text-[11px] text-ink-mute mt-2">
          {series.note}
          {" "}Covers {formatPct(series.covered_pct)} of net worth ({formatCompactINR(series.covered_value)}).
        </p>
      )}
    </Card>
  );
}
