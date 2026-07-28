import { NavLink } from "react-router-dom";
import { ReactNode } from "react";
import { DEMO, REPO_URL } from "../lib/demo";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/holdings", label: "Holdings", icon: "≣" },
  { to: "/mutual-funds", label: "Mutual Funds", icon: "◴" },
  { to: "/stocks-etfs", label: "Stocks & ETFs", icon: "↗" },
  { to: "/rebalancing", label: "Rebalancing", icon: "⇄" },
  { to: "/analytics", label: "Analytics (XIRR)", icon: "∿" },
  { to: "/transactions", label: "Transactions", icon: "⇅" },
  { to: "/reports", label: "Reports", icon: "🖶" },
  { to: "/imports", label: "Data & Imports", icon: "⤓" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="text-xl font-bold text-ink">dhan<span className="text-brand">360</span></div>
          <div className="text-xs text-ink-mute mt-0.5">Your portfolio, 360°</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand/10 text-brand" : "text-ink-soft hover:bg-slate-50"
                }`
              }
            >
              <span className="w-4 text-center opacity-70">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 text-[11px] text-ink-mute border-t border-slate-100 leading-relaxed">
          Local & private. Data stays on this machine.
          <br />
          Not investment advice.
          <br />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-soft hover:text-brand underline"
          >
            Source code (AGPL-3.0)
          </a>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {DEMO && (
          <div className="bg-brand/10 border-b border-brand/20 text-brand text-sm px-6 py-2 flex items-center gap-2">
            <span className="font-semibold">Live demo</span>
            <span className="text-ink-soft">
              — you're exploring a sample portfolio. Imports and edits are disabled. To use your own
              data privately,{" "}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
                self-host it
              </a>.
            </span>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
