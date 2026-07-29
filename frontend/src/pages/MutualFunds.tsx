import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, ConfidenceBadge, Loading, PageHeader } from "../components/Common";
import BarList from "../components/BarList";
import DonutChart from "../components/DonutChart";
import { InfoTip } from "../components/InfoTip";
import { formatINR, formatPct, signClass } from "../lib/format";
import { ASSET_COLORS } from "../lib/colors";

export default function MutualFunds() {
  const { data, isLoading } = useQuery({ queryKey: ["mutual-funds"], queryFn: api.mutualFunds });
  const overlapQ = useQuery({ queryKey: ["overlap"], queryFn: api.overlap });
  if (isLoading || !data) return <Loading />;

  return (
    <>
      <PageHeader title="Mutual Fund Analysis" subtitle={`${data.count} schemes · ${formatINR(data.total)} · scheme, AMC, plan & overlap views`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="By AMC"><BarList data={data.by_amc} /></Card>
        <Card title="Direct vs Regular"><DonutChart data={data.by_plan} centerLabel="Plan" /></Card>
        <Card title={<>Direct ↔ Stock Overlap<InfoTip term="overlap" /></>}>
          {overlapQ.data ? (
            <div>
              <div className="text-2xl font-bold text-ink">{formatPct(overlapQ.data.overlap_pct)}</div>
              <p className="text-xs text-ink-mute mb-2">of portfolio is held both directly and inside funds (disclosed look-through).</p>
              <ul className="text-sm space-y-1">
                {overlapQ.data.overlaps.slice(0, 6).map((o: any) => (
                  <li key={o.name} className="flex justify-between"><span className="text-ink-soft truncate">{o.name}</span><span className="tabular-nums">{formatINR(o.value)}</span></li>
                ))}
              </ul>
            </div>
          ) : <Loading />}
        </Card>
      </div>

      <Card title="Schemes">
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Scheme</th><th>AMC</th><th>Plan</th><th>Class</th>
                <th>Equity / Debt / Gold split</th>
                <th className="text-right">Invested</th><th className="text-right">Current</th><th className="text-right">P&L</th><th>Conf.</th>
              </tr>
            </thead>
            <tbody>
              {data.schemes.map((s: any) => (
                <tr key={s.name}>
                  <td className="font-medium max-w-[240px] truncate" title={s.name}>{s.name}</td>
                  <td className="text-ink-mute max-w-[120px] truncate">{s.amc}</td>
                  <td className="capitalize text-ink-soft">{s.plan}</td>
                  <td>{s.asset_class}</td>
                  <td><SplitBar split={s.split} /></td>
                  <td className="text-right tabular-nums text-ink-soft">{formatINR(s.invested_value)}</td>
                  <td className="text-right tabular-nums font-medium">{formatINR(s.current_value)}</td>
                  <td className={`text-right tabular-nums ${signClass(s.pnl)}`}>{s.pnl === null ? "—" : formatPct(s.pnl_pct)}</td>
                  <td><ConfidenceBadge confidence={s.confidence} estimated={s.is_estimated} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function SplitBar({ split }: { split: Record<string, number> }) {
  const total = Object.values(split).reduce((a, b) => a + b, 0);
  if (!total) return <span className="text-ink-mute text-xs">—</span>;
  return (
    <div className="flex h-3 w-40 rounded overflow-hidden" title={Object.entries(split).map(([k, v]) => `${k}: ${((v / total) * 100).toFixed(0)}%`).join(", ")}>
      {Object.entries(split).map(([k, v]) => (
        <div key={k} style={{ width: `${(v / total) * 100}%`, background: ASSET_COLORS[k] ?? "#cbd5e1" }} />
      ))}
    </div>
  );
}
