import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from "recharts";
import { Slice } from "../lib/api";
import { colorFor } from "../lib/colors";
import { formatCompactINR, formatPct } from "../lib/format";

interface Props {
  data: Slice[];
  onSliceClick?: (label: string) => void;
  activeLabel?: string | null;
  centerLabel?: string;
  centerValue?: string;
}

// Enlarged active slice on hover (Zerodha-Console style highlight).
function renderActive(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

export default function DonutChart({ data, onSliceClick, activeLabel, centerLabel, centerValue }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((a, b) => a + b.value, 0);
  const activeIdx = hover ?? (activeLabel ? filtered.findIndex((d) => d.label === activeLabel) : -1);
  const shown = activeIdx >= 0 ? filtered[activeIdx] : null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: 190, height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={86}
              paddingAngle={1.5}
              startAngle={90}
              endAngle={-270}
              activeIndex={activeIdx >= 0 ? activeIdx : undefined}
              activeShape={renderActive}
              onMouseLeave={() => setHover(null)}
              isAnimationActive={false}
            >
              {filtered.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={colorFor(d.label, i)}
                  opacity={activeLabel && activeLabel !== d.label ? 0.4 : 1}
                  stroke="#fff"
                  strokeWidth={1}
                  style={{ cursor: onSliceClick ? "pointer" : "default", outline: "none" }}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => onSliceClick?.(d.label)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
          {shown ? (
            <>
              <div className="text-[11px] font-medium text-ink-mute truncate max-w-[110px]">{shown.label}</div>
              <div className="text-base font-bold text-ink">{formatPct(shown.pct)}</div>
              <div className="text-[11px] text-ink-mute">{formatCompactINR(shown.value)}</div>
            </>
          ) : (
            <>
              <div className="text-[11px] font-medium text-ink-mute">{centerLabel ?? "Total"}</div>
              <div className="text-sm font-bold text-ink">{centerValue ?? formatCompactINR(total)}</div>
            </>
          )}
        </div>
      </div>

      <ul className="flex-1 min-w-0 space-y-1.5">
        {filtered.map((d, i) => (
          <li
            key={d.label}
            className={`flex items-center gap-2 text-sm rounded px-1.5 py-0.5 ${
              onSliceClick ? "cursor-pointer hover:bg-slate-50" : ""
            } ${activeIdx === i ? "bg-slate-50" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSliceClick?.(d.label)}
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorFor(d.label, i) }} />
            <span className="flex-1 truncate text-ink-soft">{d.label}</span>
            <span className="tabular-nums text-ink-mute">{formatPct(d.pct)}</span>
            <span className="tabular-nums font-medium text-ink w-20 text-right">{formatCompactINR(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
