import { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5 gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-mute mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={`card p-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="font-semibold text-ink">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="text-sm text-ink-mute py-10 text-center">{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-ink-mute py-10 text-center">{children}</div>;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  manual: "bg-violet-100 text-violet-700",
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-orange-100 text-orange-700",
  estimated: "bg-sky-100 text-sky-700",
  none: "bg-slate-200 text-slate-600",
};

export function ConfidenceBadge({ confidence, estimated }: { confidence: string; estimated?: boolean }) {
  const label = estimated && confidence !== "manual" ? "estimated" : confidence;
  return <span className={`pill ${CONFIDENCE_STYLES[label] ?? CONFIDENCE_STYLES.none}`}>{label}</span>;
}
