import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import HoldingsTable from "../components/HoldingsTable";
import { formatINR } from "../lib/format";

const FILTER_KEYS = ["asset_class", "cap", "sub_class", "sector", "source", "account"] as const;
const LABELS: Record<string, string> = {
  asset_class: "Asset class",
  cap: "Market cap",
  sub_class: "Sub-class",
  sector: "Sector",
  source: "Source",
  account: "Account",
};

export default function Holdings() {
  const [params, setParams] = useSearchParams();
  const active = Object.fromEntries(
    FILTER_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)!])
  );

  const { data, isLoading } = useQuery({
    queryKey: ["holdings", active],
    queryFn: () => api.holdings(active),
  });

  const removeFilter = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next);
  };

  const showContribution = !!(active.cap || active.sector || active.sub_class || active.asset_class);

  return (
    <>
      <PageHeader
        title="Holdings"
        subtitle="Every position across all imported and manual sources."
        actions={
          Object.keys(active).length > 0 ? (
            <button className="btn-ghost" onClick={() => setParams(new URLSearchParams())}>
              Clear filters
            </button>
          ) : undefined
        }
      />

      {Object.keys(active).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {Object.entries(active).map(([k, v]) => (
            <span key={k} className="pill bg-brand/10 text-brand">
              {LABELS[k]}: {v}
              <button className="ml-1 hover:text-brand-dark" onClick={() => removeFilter(k)}>✕</button>
            </span>
          ))}
        </div>
      )}

      <Card>
        {isLoading || !data ? (
          <Loading />
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-ink-mute">{data.count} holdings</span>
              <span className="font-medium">Total: {formatINR(data.total_value)}</span>
            </div>
            <HoldingsTable holdings={data.holdings} showContribution={showContribution} />
          </>
        )}
      </Card>
    </>
  );
}
