import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Loading, PageHeader } from "../components/Common";

const SOURCES = [
  { id: "zerodha_holdings", label: "Zerodha Holdings CSV", accept: ".csv" },
  { id: "zerodha_tradebook", label: "Zerodha Tradebook CSV", accept: ".csv" },
  { id: "cas_json", label: "CAS JSON (casparser)", accept: ".json" },
  { id: "cas_pdf", label: "CAS PDF (CAMS/KFintech)", accept: ".pdf" },
  { id: "generic_csv", label: "Generic CSV template", accept: ".csv" },
];

const MANUAL_TYPES = ["ppf", "epf", "fd", "sgb", "nps", "bond", "gsec", "reit", "invit", "digital_gold", "real_estate", "cash", "other"];

export default function Imports() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [source, setSource] = useState(SOURCES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");

  const historyQ = useQuery({ queryKey: ["imports"], queryFn: api.imports });

  const refreshAll = () => {
    ["imports", "summary", "holdings", "rebalance", "mutual-funds", "stocks", "concentration", "overlap"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const doUpload = async () => {
    if (!file) return setMsg({ kind: "err", text: "Choose a file first." });
    setBusy("upload");
    setMsg(null);
    try {
      const form = new FormData();
      form.append("source", source.id);
      form.append("file", file);
      if (password) form.append("password", password);
      if (accountName) form.append("account_name", accountName);
      const res: any = await api.upload(form);
      setMsg({ kind: "ok", text: `Imported ${res.count_imported} (merged ${res.count_merged}, dup ${res.count_duplicate}, skipped ${res.count_skipped}).` });
      setFile(null);
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
          <>
            <button className="btn-ghost" onClick={loadSample} disabled={!!busy}>{busy === "sample" ? "Loading…" : "Load sample data"}</button>
            <button className="btn-ghost text-rose-600" onClick={resetAll} disabled={!!busy}>Reset</button>
          </>
        }
      />

      {msg && (
        <div className={`mb-4 text-sm rounded-lg px-3 py-2 ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Upload a statement">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSource(s)}
                  className={`text-left text-sm rounded-lg border px-3 py-2 ${source.id === s.id ? "border-brand bg-brand/5 text-brand" : "border-slate-200 text-ink-soft hover:bg-slate-50"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <input
              type="file"
              accept={source.accept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
            />
            {source.id === "cas_pdf" && (
              <input type="password" placeholder="CAS PDF password (usually your PAN)" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            )}
            {source.accept === ".csv" && (
              <input type="text" placeholder="Account name (optional)" value={accountName} onChange={(e) => setAccountName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            )}
            <button className="btn-primary w-full" onClick={doUpload} disabled={!!busy}>
              {busy === "upload" ? "Importing…" : "Import"}
            </button>
          </div>
        </Card>

        <ManualEntry onDone={(text) => { setMsg({ kind: "ok", text }); refreshAll(); }} />
      </div>

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
  { name: "MF Central", url: "https://app.mfcentral.com/" },
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
    <Card title="Don't have your CAS yet? Generate one" className="mb-4">
      <p className="text-sm text-ink-mute mb-3">
        A CAS (Consolidated Account Statement) is requested on the official RTA/depository site and
        emailed to your <span className="font-medium">registered email</span> as a password-protected
        PDF. dhan360 can't (and shouldn't) request it for you — but here's exactly where to do it, then
        upload the PDF above.
      </p>
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
    </Card>
  );
}

function ManualEntry({ onDone }: { onDone: (text: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("fd");
  const [currentValue, setCurrentValue] = useState<number | "">("");
  const [investedValue, setInvestedValue] = useState<number | "">("");
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
      }]);
      onDone(`Added "${name}".`);
      setName(""); setCurrentValue(""); setInvestedValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add a manual asset (PPF / FD / SGB / NPS / …)">
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
        <button className="btn-primary w-full" onClick={submit} disabled={busy || !name || currentValue === ""}>
          {busy ? "Adding…" : "Add asset"}
        </button>
        <p className="text-[11px] text-ink-mute">Type drives classification (e.g. SGB → Gold, PPF → Debt).</p>
      </div>
    </Card>
  );
}
