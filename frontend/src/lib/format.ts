// Indian-style number/currency formatting (lakhs/crores grouping).

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return "₹" + inr.format(Math.round(value));
}

export function formatCompactINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(1)}K`;
  return "₹" + inr.format(Math.round(value));
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}

export function signClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-ink-mute";
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}
