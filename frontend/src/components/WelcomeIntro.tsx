import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { REPO_URL } from "../lib/demo";

const KEY = "dhan360_intro_dismissed";

const POINTS = [
  "All your assets in one view — MF, stocks, ETFs, gold, PPF, NPS, FDs, SGBs & more",
  "Fund look-through — see the true sector & market-cap exposure inside your funds",
  "Direct-vs-fund overlap, concentration, XIRR & a performance curve",
  "Rebalancing vs a target you set — drift, suggested moves, new-money mode",
  "Click any chart to filter your holdings; every classification shows its confidence",
];

/** First-visit explainer for the hosted app: what it is, the privacy model, and a nudge to import. */
export default function WelcomeIntro() {
  const nav = useNavigate();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(KEY) !== "1"; } catch { return true; }
  });
  if (!open) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <div className="relative mb-5 rounded-xl border border-brand/20 bg-gradient-to-br from-brand/[0.06] to-transparent p-5">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-ink-mute hover:text-ink text-lg leading-none"
      >
        ✕
      </button>

      <h2 className="text-lg font-bold text-ink">Welcome — your portfolio, 360°</h2>
      <p className="text-sm text-ink-soft mt-1 max-w-3xl">
        A <span className="font-medium">privacy-first</span> portfolio analytics &amp; rebalancing tool for Indian investors.
        Everything runs <span className="font-medium">in your browser</span> — your holdings are computed and stored on
        <span className="font-medium"> your device</span> and never uploaded. No signup, no account, nothing collected.
      </p>

      <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 max-w-4xl">
        {POINTS.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink-soft">
            <span className="text-brand mt-0.5">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-ink-mute mt-3">
        You're viewing a <span className="font-medium">sample portfolio</span>. Import your own — Zerodha CSVs,
        a mutual-fund CAS, or manual assets — to replace it. It stays on your device; back it up anytime from Reports.
      </p>

      <div className="flex flex-wrap gap-2 mt-4">
        <button className="btn-primary" onClick={() => { dismiss(); nav("/imports"); }}>Import my data →</button>
        <a className="btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">How it works ↗</a>
        <button className="btn-ghost" onClick={dismiss}>Explore the sample</button>
      </div>

      <p className="text-[11px] text-ink-mute mt-3">Analytics only — not investment advice.</p>
    </div>
  );
}
