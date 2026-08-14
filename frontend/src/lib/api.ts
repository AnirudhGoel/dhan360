// Thin typed fetch wrapper around the FastAPI backend.

export interface Slice {
  label: string;
  value: number;
  pct: number;
}

export interface Summary {
  net_worth: number;
  invested: number;
  pnl: number;
  pnl_pct: number;
  estimated_value: number;
  estimated_pct: number;
  holdings_count: number;
  asset_allocation: Slice[];
  equity_cap_split: Slice[];
  debt_split: Slice[];
  gold_split: Slice[];
  sector_exposure: Slice[];
  by_source: Slice[];
  by_account: Slice[];
}

export interface Holding {
  id: number;
  name: string;
  instrument_type: string;
  symbol: string | null;
  isin: string | null;
  account: string;
  source: string;
  quantity: number;
  avg_cost: number | null;
  invested_value: number | null;
  current_value: number;
  pnl: number | null;
  pnl_pct: number | null;
  asset_class: string;
  sub_class: string | null;
  market_cap: string | null;
  sector: string | null;
  confidence: string;
  is_estimated: boolean;
  amc: string | null;
  plan: string | null;
  contribution: number | null;
}

export interface RebalanceLine {
  bucket: string;
  current_value: number;
  current_pct: number;
  target_pct: number;
  target_value: number;
  drift_pct: number;
  drift_value: number;
  action: string;
  amount: number;
  status: string;
  warnings: string[];
}

import { DEMO, demoGet, DemoReadOnlyError } from "./demo";
import { clientApi } from "../engine/clientApi";

async function http<T>(url: string, opts?: RequestInit): Promise<T> {
  if (DEMO) {
    const method = (opts?.method ?? "GET").toUpperCase();
    if (method === "GET") return demoGet<T>(url);
    return Promise.resolve({ demo: true } as T); // mutations are no-ops in the demo
  }
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

const httpApi = {
  summary: () => http<Summary>("/api/portfolio/summary"),
  holdings: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return http<{ holdings: Holding[]; count: number; total_value: number }>(
      `/api/holdings${q ? `?${q}` : ""}`
    );
  },
  xirr: (scope: string, from?: string, to?: string) => {
    const q = new URLSearchParams({ scope });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return http<{
      scope: string;
      is_period: boolean;
      note: string;
      results: {
        label: string;
        xirr: number | null;
        current_value: number;
        invested: number;
        covered_value: number;
        coverage_pct: number;
        start_value: number;
        end_value: number;
        flags: Record<string, boolean>;
      }[];
    }>(`/api/analytics/xirr?${q.toString()}`);
  },
  transactions: () => http<{
    transactions: {
      id: number; date: string; instrument: string; symbol: string | null;
      instrument_type: string; asset_class: string; kind: string;
      units: number | null; amount: number; direction: string;
      price: number | null; account: string | null; source: string;
    }[];
    count: number; total_invested_out: number; total_in: number;
  }>("/api/transactions"),
  performance: () => http<{
    mf:       { points: { date: string; nav: number; return_pct: number; value: number; invested: number }[]; available: boolean; covered_value: number; covered_pct: number; final_return_pct: number; note: string };
    equity:   { points: { date: string; nav: number; return_pct: number; value: number; invested: number }[]; available: boolean; covered_value: number; covered_pct: number; final_return_pct: number; note: string };
    combined: { points: { date: string; nav: number; return_pct: number; value: number; invested: number }[]; available: boolean; covered_value: number; covered_pct: number; final_return_pct: number; note: string };
  }>("/api/analytics/performance"),
  mutualFunds: () => http<any>("/api/mutual-funds"),
  stocks: () => http<any>("/api/stocks"),
  concentration: () => http<any>("/api/concentration"),
  overlap: () => http<any>("/api/overlap"),
  rebalance: (mode: string, newMoney = 0) =>
    http<{ lines: RebalanceLine[]; has_targets: boolean; net_worth: number; disclaimer: string }>(
      `/api/rebalance?mode=${mode}&new_money=${newMoney}`
    ),
  imports: () => http<any[]>("/api/imports"),
  taxonomy: () => http<any>("/api/taxonomy"),
  overrides: () => http<any[]>("/api/overrides"),
  createOverride: (body: any) =>
    http("/api/overrides", { method: "POST", body: JSON.stringify(body) }),
  deleteOverride: (id: number) => http(`/api/overrides/${id}`, { method: "DELETE" }),
  getTargets: () => http<{ targets: { bucket: string; target_pct: number }[]; sum: number }>("/api/targets"),
  setTargets: (targets: { bucket: string; target_pct: number }[]) =>
    http("/api/targets", { method: "PUT", body: JSON.stringify(targets) }),
  upload: (form: FormData) => {
    if (DEMO) return Promise.reject(new DemoReadOnlyError());
    return fetch("/api/imports/upload", { method: "POST", body: form }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? r.statusText);
      return r.json();
    });
  },
  manual: (entries: any[]) =>
    http("/api/imports/manual", { method: "POST", body: JSON.stringify(entries) }),
  seed: () => http("/api/admin/seed", { method: "POST" }),
  reset: () => http("/api/admin/reset", { method: "POST" }),
  reclassify: () => http("/api/admin/reclassify", { method: "POST" }),
};

// Client mode (VITE_CLIENT=true): everything runs in the browser against the local engine —
// no backend, data stays on the device. Falls back to the HTTP backend for self-host.
export const CLIENT = import.meta.env.VITE_CLIENT === "true";
export const api: typeof httpApi = CLIENT ? (clientApi as unknown as typeof httpApi) : httpApi;
