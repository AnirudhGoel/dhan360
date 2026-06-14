import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import { formatINR, formatPct } from "../lib/format";

function downloadCSV(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) => r.map((c) => (c === null ? "" : `"${String(c).replace(/"/g, '""')}"`)).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const summaryQ = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const holdingsQ = useQuery({ queryKey: ["holdings", {}], queryFn: () => api.holdings() });
  if (summaryQ.isLoading || !summaryQ.data) return <Loading />;
  const s = summaryQ.data;

  const exportAllocation = () =>
    downloadCSV("dhan360-allocation.csv", [
      ["Asset Class", "Value", "Percent"],
      ...s.asset_allocation.map((a) => [a.label, a.value, a.pct]),
    ]);

  const exportHoldings = () => {
    const h = holdingsQ.data?.holdings ?? [];
    downloadCSV("dhan360-holdings.csv", [
      ["Name", "Symbol/ISIN", "Type", "Account", "Asset Class", "Cap/Sub", "Sector", "Qty", "Invested", "Current", "P&L", "Confidence"],
      ...h.map((x) => [x.name, x.symbol ?? x.isin, x.instrument_type, x.account, x.asset_class, x.market_cap ?? x.sub_class, x.sector, x.quantity, x.invested_value, x.current_value, x.pnl, x.confidence]),
    ]);
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Export your portfolio. Everything is generated locally in your browser." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Snapshot">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-mute">Net worth</dt><dd className="text-right font-medium tabular-nums">{formatINR(s.net_worth)}</dd>
            <dt className="text-ink-mute">Invested</dt><dd className="text-right tabular-nums">{formatINR(s.invested)}</dd>
            <dt className="text-ink-mute">Unrealised P&L</dt><dd className="text-right tabular-nums">{formatINR(s.pnl)} ({formatPct(s.pnl_pct)})</dd>
            <dt className="text-ink-mute">Holdings</dt><dd className="text-right tabular-nums">{s.holdings_count}</dd>
            <dt className="text-ink-mute">Estimated exposure</dt><dd className="text-right tabular-nums">{formatPct(s.estimated_pct)}</dd>
          </dl>
        </Card>
        <Card title="Downloads">
          <div className="space-y-2">
            <button className="btn-ghost w-full justify-start" onClick={exportAllocation}>⤓ Asset allocation (CSV)</button>
            <button className="btn-ghost w-full justify-start" onClick={exportHoldings} disabled={!holdingsQ.data}>⤓ All holdings (CSV)</button>
            <button className="btn-ghost w-full justify-start" onClick={() => window.print()}>🖶 Print / Save as PDF</button>
          </div>
          <p className="text-[11px] text-ink-mute mt-3">Capital-gains & XIRR reports are placeholders in this MVP — see the roadmap.</p>
        </Card>
      </div>
    </>
  );
}
