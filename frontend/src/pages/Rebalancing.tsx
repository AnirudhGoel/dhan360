import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, RebalanceLine } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import { InfoTip } from "../components/InfoTip";
import { formatINR, formatPct } from "../lib/format";

const ACTION_STYLES: Record<string, string> = {
  buy: "bg-emerald-100 text-emerald-700",
  sell: "bg-rose-100 text-rose-700",
  hold: "bg-slate-100 text-slate-600",
};
const STATUS_STYLES: Record<string, string> = {
  overweight: "text-rose-600",
  underweight: "text-amber-600",
  "on target": "text-emerald-600",
};

export default function Rebalancing() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"rebalance" | "new_money">("rebalance");
  const [newMoney, setNewMoney] = useState(100000);
  const [edit, setEdit] = useState<Record<string, number> | null>(null);

  const targetsQ = useQuery({ queryKey: ["targets"], queryFn: api.getTargets });
  const planQ = useQuery({
    queryKey: ["rebalance", mode, newMoney],
    queryFn: () => api.rebalance(mode, mode === "new_money" ? newMoney : 0),
  });

  const targets = targetsQ.data?.targets ?? [];
  const editing = edit ?? Object.fromEntries(targets.map((t) => [t.bucket, t.target_pct]));
  const editSum = Object.values(editing).reduce((a, b) => a + b, 0);

  const saveTargets = async () => {
    await api.setTargets(Object.entries(editing).map(([bucket, target_pct]) => ({ bucket, target_pct })));
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["targets"] });
    qc.invalidateQueries({ queryKey: ["rebalance"] });
  };

  return (
    <>
      <PageHeader
        title="Rebalancing"
        subtitle="Compare current vs target allocation, see drift and suggested moves."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Target Allocation" className="lg:col-span-1"
          actions={edit ? <button className="btn-primary !py-1 !px-2 text-xs" disabled={Math.abs(editSum - 100) > 0.5} onClick={saveTargets}>Save</button> : undefined}>
          {targetsQ.isLoading ? (
            <Loading />
          ) : (
            <div className="space-y-2">
              {Object.entries(editing).map(([bucket, pct]) => (
                <div key={bucket} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-ink-soft">{bucket}</span>
                  <input
                    type="number"
                    className="w-16 text-right text-sm border border-slate-200 rounded px-2 py-1 tabular-nums"
                    value={pct}
                    onChange={(e) => setEdit({ ...editing, [bucket]: Number(e.target.value) })}
                  />
                  <span className="text-ink-mute text-sm">%</span>
                </div>
              ))}
              <div className={`flex justify-between text-sm pt-2 border-t border-slate-100 ${Math.abs(editSum - 100) > 0.5 ? "text-rose-600" : "text-emerald-600"}`}>
                <span>Total</span>
                <span className="font-medium tabular-nums">{editSum.toFixed(0)}%</span>
              </div>
              {Math.abs(editSum - 100) > 0.5 && <p className="text-xs text-rose-500">Targets should add up to 100%.</p>}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Rebalance Plan"
          actions={
            <div className="flex items-center gap-1 text-xs">
              <button className={`px-2 py-1 rounded ${mode === "rebalance" ? "bg-brand text-white" : "bg-slate-100 text-ink-soft"}`} onClick={() => setMode("rebalance")}>Buy & Sell</button>
              <button className={`px-2 py-1 rounded ${mode === "new_money" ? "bg-brand text-white" : "bg-slate-100 text-ink-soft"}`} onClick={() => setMode("new_money")}>New money only</button>
            </div>
          }>
          {mode === "new_money" && (
            <div className="flex items-center gap-2 mb-3 text-sm">
              <span className="text-ink-mute">Amount to invest:</span>
              <input type="number" className="w-32 border border-slate-200 rounded px-2 py-1 tabular-nums" value={newMoney} onChange={(e) => setNewMoney(Number(e.target.value))} />
            </div>
          )}
          {planQ.isLoading || !planQ.data ? (
            <Loading />
          ) : (
            <RebalanceTable lines={planQ.data.lines} mode={mode} />
          )}
          <p className="text-[11px] text-ink-mute mt-3">{planQ.data?.disclaimer}</p>
        </Card>
      </div>
    </>
  );
}

function RebalanceTable({ lines, mode }: { lines: RebalanceLine[]; mode: string }) {
  const visible = lines.filter((l) => l.current_value > 0 || l.target_pct > 0);
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Asset Class</th>
            <th className="text-right">Current</th>
            <th className="text-right">Target</th>
            <th className="text-right"><span className="inline-flex items-center justify-end">Drift<InfoTip term="drift" /></span></th>
            <th>Status</th>
            <th className="text-right">{mode === "new_money" ? "Invest" : "Action"}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((l) => (
            <tr key={l.bucket}>
              <td className="font-medium">{l.bucket}</td>
              <td className="text-right tabular-nums">{formatPct(l.current_pct)}<div className="text-[11px] text-ink-mute">{formatINR(l.current_value)}</div></td>
              <td className="text-right tabular-nums text-ink-soft">{formatPct(l.target_pct)}</td>
              <td className={`text-right tabular-nums ${l.drift_pct > 0 ? "text-rose-600" : l.drift_pct < 0 ? "text-amber-600" : "text-ink-mute"}`}>
                {l.drift_pct > 0 ? "+" : ""}{formatPct(l.drift_pct)}
              </td>
              <td className={STATUS_STYLES[l.status] ?? "text-ink-mute"}>{l.status}</td>
              <td className="text-right">
                {l.action === "hold" ? (
                  <span className="text-ink-mute text-sm">—</span>
                ) : (
                  <span className="inline-flex flex-col items-end">
                    <span className={`pill ${ACTION_STYLES[l.action]}`}>{l.action.toUpperCase()}</span>
                    <span className="tabular-nums text-sm mt-0.5">{formatINR(l.amount)}</span>
                    {l.warnings.length > 0 && (
                      <span className="text-[10px] text-amber-600 max-w-[220px] text-right mt-0.5" title={l.warnings.join(" ")}>⚠ tax/exit-load note</span>
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
