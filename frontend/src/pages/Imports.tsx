import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";
import { DEMO, REPO_URL } from "../lib/demo";

interface SourceDef { id: string; label: string; accept: string; hint: string; advanced?: boolean }
interface SourceGroup { key: string; title: string; sources: SourceDef[] }

const SOURCE_GROUPS: SourceGroup[] = [
  {
    key: "equity",
    title: "Stocks & ETFs",
    sources: [
      { id: "zerodha_holdings", label: "Zerodha — Holdings", accept: ".csv",
        hint: "Console → Portfolio → Holdings. Powers allocation, net worth and current value." },
      { id: "zerodha_tradebook", label: "Zerodha — Tradebook", accept: ".csv",
        hint: "Console → Reports → Tradebook. Unlocks XIRR. Combine yearly files — Zerodha caps each at ~1 year." },
      { id: "generic_csv", label: "Other broker (Generic CSV)", accept: ".csv",
        hint: "Any broker via a simple column template — see the docs for the format." },
    ],
  },
  {
    key: "mf",
    title: "Mutual funds",
    sources: [
      { id: "cas_pdf", label: "CAS PDF (CAMS / KFintech)", accept: ".pdf",
        hint: "Upload the PDF and we parse it. Password is usually your PAN." },
      { id: "cas_json", label: "CAS JSON (parse locally)", accept: ".json", advanced: true,
        hint: "Run casparser locally and upload the JSON output — nothing leaves your device." },
    ],
  },
  {
    key: "advanced",
    title: "Advanced",
    sources: [
      { id: "prices_csv", label: "Historical prices CSV", accept: ".csv", advanced: true,
        hint: "Only needed without the Kite price feed — fills equity prices for period XIRR." },
    ],
  },
];
const ALL_SOURCES: SourceDef[] = SOURCE_GROUPS.flatMap((g) => g.sources);

const MANUAL_TYPES = ["ppf", "epf", "fd", "sgb", "nps", "bond", "gsec", "reit", "invit", "digital_gold", "real_estate", "cash", "other"];

export default function Imports() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [source, setSource] = useState<SourceDef>(ALL_SOURCES[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const historyQ = useQuery({ queryKey: ["imports"], queryFn: api.imports });

  const refreshAll = () => {
    ["imports", "summary", "holdings", "rebalance", "mutual-funds", "stocks", "concentration", "overlap"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const doUpload = async () => {
    if (!files.length) return setMsg({ kind: "err", text: "Choose a file first." });
    setBusy("upload");
    setMsg(null);
    try {
      const form = new FormData();
      form.append("source", source.id);
      for (const f of files) form.append("file", f);
      if (password) form.append("password", password);
      if (accountName) form.append("account_name", accountName);
      const res: any = await api.upload(form);
      setMsg({ kind: "ok", text: `Imported ${res.count_imported} (merged ${res.count_merged}, dup ${res.count_duplicate}, skipped ${res.count_skipped}).` });
      setFiles([]);
      refreshAll();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const loadSample = async () => {
    setBusy("sample"); setMsg(null);
    try { await api.seed(); setMsg({ kind: "ok", text: "Sample portfolio loaded." }); refreshAll(); }
    catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(null); }
  };
  const reclassify = async () => {
    setBusy("reclassify"); setMsg(null);
    try {
      const res: any = await api.reclassify();
      setMsg({ kind: "ok", text: `Reclassified ${res.reclassified} instruments — no data was reset.` });
      refreshAll();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(null); }
  };
  const resetAll = async () => {
    if (!confirm("Delete ALL local portfolio data? This cannot be undone.")) return;
    setBusy("reset"); setMsg(null);
    try { await api.reset(); setMsg({ kind: "ok", text: "All data cleared." }); refreshAll(); }
    catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader
        title="Data & Imports"
        subtitle="Upload statements, add manual assets, and review what was imported. Files are parsed locally."
        actions={
          DEMO ? undefined : (
            <>
              <button className="btn-ghost" onClick={loadSample} disabled={!!busy}>{busy === "sample" ? "Loading…" : "Load sample data"}</button>
              <button className="btn-ghost" onClick={reclassify} disabled={!!busy} title="Re-run asset classification on all holdings without resetting data">{busy === "reclassify" ? "Reclassifying…" : "Reclassify"}</button>
              <button className="btn-ghost text-rose-600" onClick={resetAll} disabled={!!busy}>Reset</button>
            </>
          )
        }
      />

      {msg && (
        <div className={`mb-4 text-sm rounded-lg px-3 py-2 ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}

      {DEMO ? (
        <Card className="mb-4" title="Imports are disabled in the demo">
          <p className="text-sm text-ink-soft">
            This live demo shows a fixed <span className="font-medium">sample portfolio</span> so you can
            explore the analytics. Uploading statements and adding assets are turned off here.
          </p>
          <p className="text-sm text-ink-mute mt-2">
            To import your <span className="font-medium">own</span> data — Zerodha CSVs, mutual-fund CAS,
            manual assets — run dhan360 locally. It's open source and your data never leaves your machine.{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-brand underline">See how to self-host →</a>
          </p>
        </Card>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Upload a statement" actions={<span className="text-xs text-ink-mute">Stocks · Mutual funds</span>}>
          <div className="space-y-4">
            {SOURCE_GROUPS.map((g) => {
              const visible = g.sources.filter((s) => !s.advanced || showAdvanced);
              if (!visible.length) return null;
              return (
                <div key={g.key}>
                  <div className="text-xs font-semibold text-ink mb-1.5">{g.title}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {visible.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSource(s)}
                        className={`text-left text-sm rounded-lg border px-3 py-2 ${source.id === s.id ? "border-brand bg-brand/5 text-brand" : "border-slate-200 text-ink-soft hover:bg-slate-50"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {g.key === "equity" && (
                    <p className="mt-1.5 text-[11px] text-ink-mute">
                      💡 Import both Holdings and Tradebook for complete allocation + XIRR.
                    </p>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => {
                if (v && source.advanced) setSource(ALL_SOURCES[0]);
                return !v;
              })}
              className="text-[11px] text-ink-soft hover:text-brand underline"
            >
              {showAdvanced ? "Hide advanced options" : "Show advanced options (CAS JSON, price CSV)"}
            </button>

            <div className="border-t border-slate-100 pt-3 space-y-3">
              <p className="text-[11px] text-ink-mute">{source.hint}</p>
              <input
                type="file"
                accept={source.accept === ".csv" ? ".csv,.xlsx,.xls" : source.accept}
                multiple={source.id === "zerodha_tradebook"}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
              />
              {files.length > 1 && (
                <p className="text-[11px] text-brand">{files.length} files selected — they'll be combined.</p>
              )}
              {source.id === "cas_pdf" && (
                <input type="password" placeholder="CAS PDF password (usually your PAN)" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              )}
              {source.accept === ".csv" && (
                <input type="text" placeholder="Account name (optional)" value={accountName} onChange={(e) => setAccountName(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              )}
              <button className="btn-primary w-full" onClick={doUpload} disabled={!!busy}>
                {busy === "upload" ? "Importing…" : files.length > 1 ? `Import ${files.length} files` : `Import ${source.label}`}
              </button>
            </div>
          </div>
        </Card>

        <ManualEntry onDone={(text) => { setMsg({ kind: "ok", text }); refreshAll(); }} />
      </div>
      )}

      <GuidedCAS />

      <Card title="Import history & reconciliation">
        {historyQ.isLoading ? (
          <Loading />
        ) : !historyQ.data?.length ? (
          <div className="text-sm text-ink-mute py-6 text-center">No imports yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th><th>Source</th><th>File</th>
                  <th className="text-right">Parsed</th><th className="text-right">Imported</th>
                  <th className="text-right">Merged</th><th className="text-right">Dup</th>
                  <th className="text-right">Skipped</th><th className="text-right">Unclassified</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historyQ.data.map((b) => (
                  <tr key={b.id}>
                    <td className="text-ink-mute">{new Date(b.created_at).toLocaleString()}</td>
                    <td>{b.source}</td>
                    <td className="text-ink-mute max-w-[160px] truncate" title={b.file_name}>{b.file_name ?? "—"}</td>
                    <td className="text-right tabular-nums">{b.count_parsed}</td>
                    <td className="text-right tabular-nums font-medium">{b.count_imported}</td>
                    <td className="text-right tabular-nums">{b.count_merged}</td>
                    <td className="text-right tabular-nums">{b.count_duplicate}</td>
                    <td className="text-right tabular-nums">{b.count_skipped}</td>
                    <td className="text-right tabular-nums">{b.count_unclassified}</td>
                    <td><span className={`pill ${b.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

const MF_CAS_LINKS = [
  { name: "CAMS (CAMS + KFintech consolidated)", url: "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" },
  { name: "KFintech CAS", url: "https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement" },
];
const DEMAT_CAS_LINKS = [
  { name: "NSDL e-CAS", url: "https://nsdlcas.nsdl.com/" },
  { name: "CDSL e-CAS", url: "https://www.cdslindia.com/CAS/LoginNew.aspx" },
];

function LinkRow({ name, url }: { name: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink-soft hover:border-brand hover:text-brand transition-colors">
      <span>{name}</span>
      <span className="text-xs">open ↗</span>
    </a>
  );
}

function GuidedCAS() {
  return (
    <details className="mb-4 group rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-5 py-4 text-sm font-semibold text-ink hover:bg-slate-50">
        <span>Don't have a CAS PDF yet? How to get one</span>
        <svg
          className="h-4 w-4 text-ink-mute transition-transform group-open:rotate-180"
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="px-5 pb-5 pt-4 border-t border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-ink-soft mb-2">Mutual funds (CAMS / KFintech) — supported now</div>
            <div className="space-y-2">{MF_CAS_LINKS.map((l) => <LinkRow key={l.url} {...l} />)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-ink-soft mb-2">Demat + MF (NSDL / CDSL) — parser coming soon</div>
            <div className="space-y-2">{DEMAT_CAS_LINKS.map((l) => <LinkRow key={l.url} {...l} />)}</div>
          </div>
        </div>
        <ol className="mt-4 text-sm text-ink-soft list-decimal pl-5 space-y-1">
          <li>Open the relevant site and request a <span className="font-medium">Detailed</span> statement for your desired period.</li>
          <li>Enter your email &amp; PAN, and <span className="font-medium">set a password you'll remember</span> (often your PAN by default).</li>
          <li>Open the email from the RTA/depository and download the PDF attachment.</li>
          <li>Upload it above (Mutual fund CAS → <span className="font-medium">CAS PDF</span>) and enter that password.</li>
        </ol>
      </div>
    </details>
  );
}

function ManualEntry({ onDone }: { onDone: (text: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("fd");
  const [currentValue, setCurrentValue] = useState<number | "">("");
  const [investedValue, setInvestedValue] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name || currentValue === "") return;
    setBusy(true);
    try {
      await api.manual([{
        name,
        instrument_type: type,
        current_value: Number(currentValue),
        invested_value: investedValue === "" ? null : Number(investedValue),
        start_date: startDate || null,
      }]);
      onDone(`Added "${name}".`);
      setName(""); setCurrentValue(""); setInvestedValue(""); setStartDate("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Everything else" actions={<span className="text-xs text-ink-mute">PPF · FD · SGB · NPS · gold…</span>}>
      <div className="space-y-3">
        <input type="text" placeholder="Asset name (e.g. SBI PPF Account)" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
        <div className="grid grid-cols-3 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2">
            {MANUAL_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
          <input type="number" placeholder="Current ₹" value={currentValue} onChange={(e) => setCurrentValue(e.target.value === "" ? "" : Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 tabular-nums" />
          <input type="number" placeholder="Invested ₹" value={investedValue} onChange={(e) => setInvestedValue(e.target.value === "" ? "" : Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 tabular-nums" />
        </div>
        <label className="block text-[11px] text-ink-mute">
          Purchase / start date <span className="text-ink-mute/70">(optional — enables XIRR)</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
        </label>
        <button className="btn-primary w-full" onClick={submit} disabled={busy || !name || currentValue === ""}>
          {busy ? "Adding…" : "Add asset"}
        </button>
      </div>
    </Card>
  );
}
