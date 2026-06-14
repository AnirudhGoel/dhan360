import { Slice } from "../lib/api";
import { colorFor } from "../lib/colors";
import { formatCompactINR, formatPct } from "../lib/format";

export default function BarList({
  data,
  onClick,
  max = 8,
}: {
  data: Slice[];
  onClick?: (label: string) => void;
  max?: number;
}) {
  const rows = data.filter((d) => d.value > 0).slice(0, max);
  const peak = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div className="space-y-2">
      {rows.map((d, i) => (
        <div
          key={d.label}
          className={`group ${onClick ? "cursor-pointer" : ""}`}
          onClick={() => onClick?.(d.label)}
        >
          <div className="flex items-center justify-between text-sm mb-0.5">
            <span className="text-ink-soft truncate">{d.label}</span>
            <span className="tabular-nums text-ink-mute">
              {formatPct(d.pct)} · <span className="text-ink font-medium">{formatCompactINR(d.value)}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all group-hover:opacity-80"
              style={{ width: `${(d.pct / peak) * 100}%`, background: colorFor(d.label, i) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
