import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";

export default function Settings() {
  const qc = useQueryClient();
  const taxonomyQ = useQuery({ queryKey: ["taxonomy"], queryFn: api.taxonomy });
  const overridesQ = useQuery({ queryKey: ["overrides"], queryFn: api.overrides });

  const [keyType, setKeyType] = useState("symbol");
  const [keyValue, setKeyValue] = useState("");
  const [assetClass, setAssetClass] = useState("");
  const [subClass, setSubClass] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    ["overrides", "summary", "holdings", "mutual-funds", "stocks", "concentration", "overlap", "rebalance"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const addOverride = async () => {
    if (!keyValue || !assetClass) return;
    setBusy(true);
    try {
      await api.createOverride({ key_type: keyType, key_value: keyValue, asset_class: assetClass, sub_class: subClass || null });
      setKeyValue(""); setSubClass("");
      refresh();
    } finally { setBusy(false); }
  };

  const remove = async (id: number) => { await api.deleteOverride(id); refresh(); };
  const reclassify = async () => { await api.reclassify(); refresh(); };

  return (
    <>
      <PageHeader title="Settings" subtitle="Classification overrides, privacy and data." actions={<button className="btn-ghost" onClick={reclassify}>Re-run classification</button>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Add a classification override" >
          <p className="text-xs text-ink-mute mb-3">Tell dhan360 how to classify a specific instrument. The rule is remembered and applied everywhere.</p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={keyType} onChange={(e) => setKeyType(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2">
                <option value="symbol">Symbol</option>
                <option value="isin">ISIN</option>
                <option value="scheme_code">Scheme code</option>
                <option value="name">Name</option>
              </select>
              <input placeholder="e.g. GOLDBEES" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2">
                <option value="">Asset class…</option>
                {taxonomyQ.data?.asset_classes.map((a: string) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input placeholder="Sub-class (optional)" value={subClass} onChange={(e) => setSubClass(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <button className="btn-primary w-full" onClick={addOverride} disabled={busy || !keyValue || !assetClass}>Save override</button>
          </div>
        </Card>

        <Card title="Active overrides">
          {overridesQ.isLoading ? <Loading /> : !overridesQ.data?.length ? (
            <div className="text-sm text-ink-mute py-6 text-center">No overrides yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {overridesQ.data.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-medium">{o.key_value}</span>
                    <span className="text-ink-mute"> ({o.key_type}) → {o.asset_class}{o.sub_class ? ` · ${o.sub_class}` : ""}</span>
                  </span>
                  <button className="text-rose-500 hover:text-rose-700" onClick={() => remove(o.id)}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Privacy & data">
        <ul className="text-sm text-ink-soft space-y-1.5 list-disc pl-5">
          <li>All data is stored in a local SQLite file on this machine. Nothing is uploaded to any server.</li>
          <li>CAS PDFs and CSVs are parsed locally by the backend process you run.</li>
          <li>Use <span className="font-medium">Data &amp; Imports → Reset</span> to wipe all local data at any time.</li>
          <li>This tool provides analytics only and is <span className="font-medium">not investment advice</span>.</li>
        </ul>
      </Card>
    </>
  );
}
