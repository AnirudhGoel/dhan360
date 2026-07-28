// Demo mode: the frontend runs with no backend, serving a bundled snapshot of the sample
// portfolio. Enabled at build time via VITE_DEMO=true (see `npm run build:demo`).
//
// Read requests are matched against captured fixtures (keys = path + sorted raw query params,
// mirroring backend/scripts/capture_demo.py). Anything not captured falls back to the closest
// sensible snapshot. Mutations are no-ops — the demo is read-only.

import fixtures from "../demo/fixtures.json";

export const DEMO = import.meta.env.VITE_DEMO === "true";

// Public repo URL — update in this one place once the GitHub repo is created.
export const REPO_URL = "https://github.com/dhan360/dhan360";

const MAP = fixtures as Record<string, any>;

function demoKey(url: string): string {
  const [path, search] = url.split("?");
  if (!search) return path;
  const p = new URLSearchParams(search);
  const parts = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`);
  return `${path}?${parts.join("&")}`;
}

export function demoGet<T>(url: string): T {
  const key = demoKey(url);
  if (key in MAP) return MAP[key] as T;

  // Graceful fallbacks for uncaptured dynamic queries.
  const [path, search] = url.split("?");
  const p = new URLSearchParams(search ?? "");
  if (path === "/api/holdings") return MAP["/api/holdings"] as T; // unfiltered
  if (path === "/api/analytics/xirr") {
    const scope = p.get("scope") ?? "portfolio";
    return MAP[`/api/analytics/xirr?scope=${scope}`] as T; // lifetime for that scope
  }
  if (path === "/api/rebalance") {
    const mode = p.get("mode") ?? "rebalance";
    const nm = mode === "new_money" ? 100000 : 0;
    return MAP[`/api/rebalance?mode=${mode}&new_money=${nm}`] as T;
  }
  return (MAP[path] ?? null) as T;
}

export class DemoReadOnlyError extends Error {
  constructor() {
    super("This is a live demo with sample data — imports and edits are disabled. Self-host to use your own data.");
  }
}
