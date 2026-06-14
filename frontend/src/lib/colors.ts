// Stable colors per bucket so the same asset class is the same color everywhere.

export const ASSET_COLORS: Record<string, string> = {
  Equity: "#2563eb",
  "International Equity": "#7c3aed",
  Debt: "#0d9488",
  Gold: "#f59e0b",
  "Real Estate": "#db2777",
  Cash: "#64748b",
  Others: "#94a3b8",
  Unclassified: "#cbd5e1",
};

// A general palette for charts where a fixed mapping doesn't exist (sectors, caps, etc.).
export const PALETTE = [
  "#2563eb",
  "#0d9488",
  "#f59e0b",
  "#7c3aed",
  "#db2777",
  "#16a34a",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#9333ea",
  "#e11d48",
  "#475569",
];

export function colorFor(label: string, index: number): string {
  return ASSET_COLORS[label] ?? PALETTE[index % PALETTE.length];
}
