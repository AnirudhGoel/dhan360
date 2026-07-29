import { NavLink } from "react-router-dom";
import { ReactNode, useState } from "react";
import { DEMO, REPO_URL } from "../lib/demo";
import { LogoMark, LogoWordmark } from "./Logo";

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

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-5 border-b border-slate-100">
        <LogoWordmark />
        <div className="text-xs text-ink-mute mt-1">Your portfolio, 360°</div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={onNavigate}
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
        Local &amp; private. Data stays on this machine.
        <br />
        Not investment advice.
        <br />
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-ink-soft hover:text-brand underline">
          Source code (AGPL-3.0)
        </a>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-slate-200 bg-white flex-col">
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 h-14">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-ink"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="font-bold text-ink">dhan<span className="text-brand">360</span></span>
        </div>
      </div>

      {/* Mobile drawer + backdrop */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={() => setOpen(false)} />
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">
        {DEMO && (
          <div className="bg-brand/10 border-b border-brand/20 text-brand text-xs sm:text-sm px-4 sm:px-6 py-2">
            <span className="font-semibold">Live demo</span>
            <span className="text-ink-soft">
              {" "}— sample portfolio; imports &amp; edits are disabled. To use your own data privately,{" "}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">self-host it</a>.
            </span>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">{children}</div>
      </main>
    </div>
  );
}
