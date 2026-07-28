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
import { formatCompactINR, formatINR, formatPct } from "../lib/format";

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

export default function PerformanceCurve() {
  const { data, isLoading } = useQuery({ queryKey: ["performance"], queryFn: api.performance });

  const title = "Mutual Fund Performance";
  if (isLoading || !data) {
    return <Card title={title}><Loading /></Card>;
  }
  if (!data.points.length) {
    return (
      <Card title={title}>
        <div className="text-sm text-ink-mute py-8 text-center">{data.note}</div>
      </Card>
    );
  }

  const final = data.final_return_pct;
  return (
    <Card
      title={title}
      actions={
        <div className="text-right">
          <span className={`text-lg font-bold ${final >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {final >= 0 ? "+" : ""}{formatPct(final)}
          </span>
          <span className="text-xs text-ink-mute ml-1">since inception</span>
        </div>
      }
    >
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={data.points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
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
      <p className="text-[11px] text-ink-mute mt-2">
        Time-weighted, unitized NAV (rebased to 0% at inception) — isolates returns from how much you
        added and when. Covers {formatPct(data.covered_pct)} of net worth ({formatCompactINR(data.covered_value)},
        the mutual-fund slice). Equity &amp; combined views arrive with the historical price feed.
      </p>
    </Card>
  );
}
