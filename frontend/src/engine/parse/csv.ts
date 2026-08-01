// CSV helpers — TS mirror of backend/app/parsers/csv_utils.py + the CAS date parser.

import Papa from "papaparse";

export function toFloat(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().replace(/,/g, "").replace(/₹/g, "").replace(/%/g, "");
  if (["", "-", "NA", "N/A", "null", "None"].includes(s)) return null;
  const neg = s.startsWith("(") && s.endsWith(")");
  s = s.replace(/^\(+|\)+$/g, "");
  const val = Number(s);
  if (Number.isNaN(val) || s === "") return null;
  return neg ? -val : val;
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function findCol(headers: string[], ...candidates: string[]): string | null {
  const norm: Record<string, string> = {};
  for (const h of headers) norm[normHeader(h)] = h;
  const candNorm = candidates.map(normHeader);
  for (const c of candNorm) if (c in norm) return norm[c];
  for (const c of candNorm) {
    for (const [nh, original] of Object.entries(norm)) {
      if (c && nh.includes(c)) return original;
    }
  }
  return null;
}

/** Parse CSV text into dict rows, skipping junk header lines above the real table. */
export function sniffRows(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/);
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commas = (line.match(/,/g) || []).length;
    if (commas >= 2 && /[a-zA-Z]/.test(line)) {
      start = i;
      break;
    }
  }
  const parsed = Papa.parse<Record<string, string>>(lines.slice(start).join("\n"), {
    header: true,
    skipEmptyLines: true,
  });
  const rows: Record<string, string>[] = [];
  for (const row of parsed.data) {
    const values = Object.values(row);
    if (values.some((v) => (v ?? "").toString().trim())) {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        clean[(k ?? "").trim()] = (v ?? "").toString().trim();
      }
      rows.push(clean);
    }
  }
  return rows;
}

/** Parse a date string to ISO YYYY-MM-DD (mirrors backend _parse_date), else null. */
export function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  // ISO first
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd-mm-yyyy or dd/mm/yyyy
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // dd-Mon-yyyy
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const dMonY = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})$/.exec(s);
  if (dMonY) {
    const m = months[dMonY[2].toLowerCase()];
    if (m) return `${dMonY[3]}-${m}-${dMonY[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
