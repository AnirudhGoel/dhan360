import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import BarList from "../components/BarList";
import { formatINR, formatPct, signClass } from "../lib/format";

export default function StocksEtfs() {
  const { data, isLoading } = useQuery({ queryKey: ["stocks"], queryFn: api.stocks });
  const concQ = useQuery({ queryKey: ["concentration"], queryFn: api.concentration });
  if (isLoading || !data) return <Loading />;

  return (
    <>
      <PageHeader title="Stock & ETF Analysis" subtitle={`Direct equity ${formatINR(data.total_direct_equity)} · ETF classification, cap & sector exposure, concentration`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Direct Stock — Cap Split"><BarList data={data.stock_cap_split} /></Card>
        <Card title="Direct Stock — Sectors"><BarList data={data.stock_sectors} max={8} /></Card>
        <Card title="Top Stock Concentration" actions={<span className="text-xs text-ink-mute">incl. fund look-through</span>}>
          {concQ.data ? (
            <ul className="text-sm space-y-1.5">
              {concQ.data.holdings.slice(0, 8).map((h: any) => (
                <li key={h.name} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-ink-soft">{h.name}</span>
                  {h.via_fund_value > 0 && h.direct_value > 0 && <span className="pill bg-amber-100 text-amber-700">overlap</span>}
                  <span className="tabular-nums text-ink-mute">{formatPct(h.pct)}</span>
                  <span className="tabular-nums font-medium w-20 text-right">{formatINR(h.value)}</span>
                </li>
              ))}
            </ul>
          ) : <Loading />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Direct Stocks (${data.stocks.length})`}>
          <EquityTable rows={data.stocks} />
        </Card>
        <Card title={`ETFs (${data.etfs.length})`}>
          <EquityTable rows={data.etfs} showClass />
        </Card>
      </div>
    </>
  );
}

function EquityTable({ rows, showClass }: { rows: any[]; showClass?: boolean }) {
  if (!rows.length) return <div className="text-sm text-ink-mute py-6 text-center">None.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            {showClass ? <th>Class</th> : <th>Cap</th>}
            <th>Sector</th>
            <th className="text-right">Current</th>
            <th className="text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="font-medium max-w-[200px] truncate" title={r.name}>{r.symbol ?? r.name}</td>
              <td className="text-ink-soft">{showClass ? `${r.asset_class}${r.sub_class ? ` · ${r.sub_class}` : ""}` : (r.market_cap ?? "—")}</td>
              <td className="text-ink-mute">{r.sector ?? "—"}</td>
              <td className="text-right tabular-nums font-medium">{formatINR(r.current_value)}</td>
              <td className={`text-right tabular-nums ${signClass(r.pnl)}`}>{r.pnl === null ? "—" : formatPct(r.pnl_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
