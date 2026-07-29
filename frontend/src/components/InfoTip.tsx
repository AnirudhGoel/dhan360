import { ReactNode, useEffect, useRef, useState } from "react";

// Plain-language definitions for the jargon dhan360 surfaces. Keep these investor-friendly.
export const GLOSSARY: Record<string, string> = {
  look_through:
    "Look-through: seeing the individual stocks and bonds inside a mutual fund, so they count toward your true sector and market-cap exposure instead of the fund being one opaque line.",
  confidence:
    "Confidence: how sure we are about a classification — 'high' = exact reference-data match, 'medium' = name/category heuristic, 'estimated' = modelled (e.g. a fund's cap split), 'manual' = your override.",
  xirr:
    "XIRR: your annualized, money-weighted return — it accounts for how much you invested and when, unlike a simple gain %.",
  coverage:
    "Coverage: the share of value we actually have dated cashflows/prices for to compute a return. The rest (e.g. snapshot-entered assets) is excluded rather than guessed.",
  drift:
    "Drift: how far an asset class has moved from your target. Positive = overweight, negative = underweight.",
  overlap:
    "Overlap: value held both directly and inside your funds (the same underlying stock), so your real concentration is higher than it looks.",
  estimated:
    "Estimated: derived rather than disclosed — e.g. a fund's cap split modelled from its SEBI category when the actual portfolio isn't available.",
  market_cap:
    "Market cap: Large = top 100 companies by size, Mid = 101–250, Small = 251+, following the AMFI convention.",
  time_weighted:
    "Time-weighted (unitized): performance isolated from how much/when you added money — deposits create 'units' at the current NAV, exactly like a mutual fund's own NAV.",
  price_return:
    "Price-return: return from price/NAV change only; dividends aren't included yet, so total return is slightly higher.",
};

export function InfoTip({ term, children }: { term?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const text = children ?? (term ? GLOSSARY[term] : "");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="More info"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-slate-400 text-[10px] leading-none font-serif italic hover:border-brand hover:text-brand"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-60 max-w-[70vw] rounded-lg bg-ink text-white text-xs font-normal normal-case tracking-normal leading-snug px-3 py-2 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
