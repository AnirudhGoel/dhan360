import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import DonutChart from "../components/DonutChart";
import BarList from "../components/BarList";
import { formatCompactINR, formatINR, formatPct, signClass } from "../lib/format";

function Stat({ label, value, sub, subClass }: { label: string; value: string; sub?: string; subClass?: string }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="stat-label truncate">{label}</div>
      <div className="text-lg sm:text-2xl font-bold text-ink mt-1 tabular-nums truncate">{value}</div>
      {sub && <div className={`text-xs sm:text-sm mt-0.5 truncate ${subClass ?? "text-ink-mute"}`}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["summary"], queryFn: api.summary });

  if (isLoading || !data) return <Loading />;

  if (data.holdings_count === 0) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Your complete portfolio, at a glance." />
        <Card>
          <div className="text-center py-12">
            <div className="text-lg font-semibold text-ink">No holdings yet</div>
            <p className="text-sm text-ink-mute mt-1 mb-4">
              Import a Zerodha CSV or CAS, add manual assets, or load the sample portfolio.
            </p>
            <button className="btn-primary" onClick={() => nav("/imports")}>Go to Data & Imports →</button>
          </div>
        </Card>
      </>
    );
  }

  const toHoldings = (params: Record<string, string>) =>
    nav(`/holdings?${new URLSearchParams(params).toString()}`);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${data.holdings_count} holdings across all sources · click any chart to drill into holdings`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Stat label="Net Worth" value={formatINR(data.net_worth)} sub={`${formatCompactINR(data.net_worth)}`} />
        <Stat label="Invested" value={formatINR(data.invested)} />
        <Stat
          label="Unrealised P&L"
          value={formatINR(data.pnl)}
          sub={formatPct(data.pnl_pct)}
          subClass={signClass(data.pnl)}
        />
        <Stat
          label="Estimated exposure"
          value={formatPct(data.estimated_pct)}
          sub={`${formatCompactINR(data.estimated_value)} via modelled look-through`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Asset Allocation" actions={<span className="text-xs text-ink-mute">click to filter</span>}>
          <DonutChart
            data={data.asset_allocation}
            onSliceClick={(label) => toHoldings({ asset_class: label })}
            centerValue={formatCompactINR(data.net_worth)}
          />
        </Card>
        <Card title="Equity — Market Cap" actions={<span className="text-xs text-ink-mute">incl. fund look-through</span>}>
          <DonutChart
            data={data.equity_cap_split}
            onSliceClick={(label) => toHoldings({ cap: label })}
            centerLabel="Equity"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Debt Breakdown">
          <BarList data={data.debt_split} onClick={(label) => toHoldings({ sub_class: label })} />
        </Card>
        <Card title="Gold Breakdown">
          <BarList data={data.gold_split} onClick={(label) => toHoldings({ sub_class: label })} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Sector Exposure" actions={<span className="text-xs text-ink-mute">stocks + fund look-through</span>}>
          <BarList data={data.sector_exposure} onClick={(label) => toHoldings({ sector: label })} max={10} />
        </Card>
        <Card title="By Source / Account">
          <BarList data={data.by_account} onClick={(label) => toHoldings({ account: label })} />
        </Card>
      </div>
    </>
  );
}
