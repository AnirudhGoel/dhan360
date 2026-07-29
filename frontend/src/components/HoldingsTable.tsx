import { Holding } from "../lib/api";
import { formatINR, formatPct, signClass } from "../lib/format";
import { ConfidenceBadge } from "./Common";
import { InfoTip } from "./InfoTip";
import { ASSET_COLORS } from "../lib/colors";

export default function HoldingsTable({
  holdings,
  showContribution = false,
}: {
  holdings: Holding[];
  showContribution?: boolean;
}) {
  if (!holdings.length) return <div className="text-sm text-ink-mute py-8 text-center">No holdings match.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Holding</th>
            <th>Source</th>
            <th>Asset Class</th>
            <th>Cap / Sub</th>
            <th>Sector</th>
            <th className="text-right">Invested</th>
            <th className="text-right">Current</th>
            <th className="text-right">P&L</th>
            {showContribution && <th className="text-right">Contributes</th>}
            <th><span className="inline-flex items-center">Confidence<InfoTip term="confidence" /></span></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.id}>
              <td>
                <div className="font-medium text-ink max-w-[260px] truncate" title={h.name}>{h.name}</div>
                <div className="text-[11px] text-ink-mute">
                  {h.symbol ?? h.isin ?? ""} · {h.instrument_type.replace("_", " ")}
                  {h.plan ? ` · ${h.plan}` : ""}
                </div>
              </td>
              <td className="text-ink-mute">{h.account}</td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: ASSET_COLORS[h.asset_class] ?? "#cbd5e1" }} />
                  {h.asset_class}
                </span>
              </td>
              <td className="text-ink-soft">{h.market_cap ?? h.sub_class ?? "—"}</td>
              <td className="text-ink-mute">{h.sector ?? "—"}</td>
              <td className="text-right tabular-nums text-ink-soft">{formatINR(h.invested_value)}</td>
              <td className="text-right tabular-nums font-medium">{formatINR(h.current_value)}</td>
              <td className={`text-right tabular-nums ${signClass(h.pnl)}`}>
                {h.pnl === null ? "—" : formatINR(h.pnl)}
                {h.pnl_pct !== null && <span className="text-[11px] ml-1">({formatPct(h.pnl_pct)})</span>}
              </td>
              {showContribution && (
                <td className="text-right tabular-nums text-brand font-medium">
                  {h.contribution !== null ? formatINR(h.contribution) : "—"}
                </td>
              )}
              <td><ConfidenceBadge confidence={h.confidence} estimated={h.is_estimated} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
