import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const routes = [
  { to: "/playground", label: "Playground" },
  { to: "/risk", label: "Risk Analyzer" },
  { to: "/diff", label: "Diff" },
  { to: "/analytics", label: "Analytics" },
  { to: "/billing", label: "Billing" },
];

interface Props {
  onKeys: () => void;
}

const Logo: React.FC = () => (
  <NavLink to="/" className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 rounded-lg">
    <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 shadow-[0_0_15px_rgba(47,128,237,0.18)] relative">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 z-10 drop-shadow-md">
        <polyline points="4,4 12,12 4,20" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="11" cy="6" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="9" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="11" cy="18" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="14" cy="14" r="1.5" fill="currentColor" stroke="none" />
        <path d="M11 6L16 9L14 14L11 18M11 6L14 14" strokeWidth="1.5" strokeOpacity="0.8" />
        <path d="M13 14L20 8H16L17 3L10 11H14L13 14Z" fill="currentColor" stroke="none" className="drop-shadow-[0_0_8px_rgba(47,128,237,0.8)]" />
      </svg>
    </div>
    <span className="text-sm font-semibold text-slate-100 tracking-tight">Inferprompt</span>
  </NavLink>
);

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${isActive ? "bg-[#1e1e2c] text-amber-400" : "text-slate-400 hover:text-slate-200 hover:bg-[#16161e]"
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-[#1e1e2c] text-amber-400" : "text-slate-300 hover:text-slate-100 hover:bg-[#16161e]"
  }`;

const Navbar: React.FC<Props> = ({ onKeys }) => {
  const { isAuthenticated, logout, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 bg-[#070b17]/95 backdrop-blur-md border-b border-[#1e1e2c]">
      {/* ── Desktop / Tablet bar ── */}
      <div className="mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8 xl:px-12 h-14 flex items-center justify-between">
        <Logo />

        {/* Desktop nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main">
          {routes.map(r => (
            <NavLink key={r.to} to={r.to} end={r.to === "/"} className={navLinkClass}>
              {r.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop right section */}
        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={onKeys}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400
                       hover:text-slate-200 hover:bg-[#16161e] border border-[#2a2a38] hover:border-[#3a3a48]
                       transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            aria-label="Manage API keys"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="15" r="5" /><path d="M11.5 11.5L20 3M18 5l2 2M15 8l2 2" />
            </svg>
            Keys
          </button>
          <div className="w-px h-4 bg-[#2a2a38]" />
          {isAuthenticated ? (
            <div className="flex items-center gap-3 bg-[#12121a] border border-[#2a2a38] rounded-lg pl-3 pr-1 py-1">
              <span className="text-xs font-semibold text-slate-300">{user?.name}</span>
              <button
                onClick={logout}
                className="text-[10px] uppercase tracking-wider font-bold bg-[#1e1e2c] hover:bg-slate-800 text-slate-400 px-2 py-1 rounded transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <NavLink to="/login" className="text-xs font-semibold hover:text-white px-3 py-1.5 rounded-lg bg-[#12121a] border border-[#2a2a38]">Sign In</NavLink>
              <NavLink to="/register" className="text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 px-3 py-1.5 rounded-lg shadow-lg shadow-amber-500/10">Create Account</NavLink>
            </div>
          )}
        </div>

        {/* Mobile: Keys + Hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={onKeys}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-400
                       hover:text-slate-200 hover:bg-[#16161e] border border-[#2a2a38]
                       transition-all focus:outline-none"
            aria-label="Manage API keys"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="15" r="5" /><path d="M11.5 11.5L20 3M18 5l2 2M15 8l2 2" />
            </svg>
            <span className="text-xs">Keys</span>
          </button>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#16161e] border border-[#2a2a38] transition-all focus:outline-none"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown menu ── */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#1e1e2c] bg-[#070b17] px-4 pb-4 pt-2 space-y-1">
          {routes.map(r => (
            <NavLink key={r.to} to={r.to} end={r.to === "/"} className={mobileNavLinkClass} onClick={closeMenu}>
              {r.label}
            </NavLink>
          ))}
          <div className="my-2 border-t border-[#1e1e2c]" />
          {isAuthenticated ? (
            <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-[#12121a] border border-[#2a2a38]">
              <span className="text-sm font-semibold text-slate-300">{user?.name}</span>
              <button
                onClick={() => { logout(); closeMenu(); }}
                className="text-xs uppercase tracking-wider font-bold bg-[#1e1e2c] hover:bg-slate-800 text-slate-400 px-3 py-1.5 rounded transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              <NavLink to="/login" onClick={closeMenu} className="text-center text-sm font-semibold hover:text-white py-2.5 rounded-lg bg-[#12121a] border border-[#2a2a38]">Sign In</NavLink>
              <NavLink to="/register" onClick={closeMenu} className="text-center text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 py-2.5 rounded-lg shadow-lg shadow-amber-500/10">Create Account</NavLink>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
