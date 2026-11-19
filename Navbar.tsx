import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Search, X } from "lucide-react";
import { useSync } from "../context/SyncContext";

interface NavbarProps {
  onOpenSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch }) => {
  const location = useLocation();
  const { libraryCount } = useSync();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { to: "/", label: "Home" },
    { to: "/movies", label: "Movies" },
    { to: "/tv-shows", label: "TV Shows" },
    {
      to: "/library",
      label: libraryCount > 0 ? `Library (${libraryCount})` : "Library",
    },
    { to: "/sync", label: "Sync" },
  ];

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-white/[0.08] bg-[#090a0f]/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-500"
        >
          XEROTV
        </Link>

        {/* Zone 2: Clean Single-Line Text Navigation */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative py-1 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-500 ${
                  active
                    ? "text-white after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:bg-rose-500"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action + Mobile Menu Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium text-slate-200 transition-colors duration-150 hover:border-white/20 hover:bg-white/10 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            aria-label="Search titles"
          >
            <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span>Search</span>
            <kbd className="hidden sm:inline-block font-mono text-[11px] text-slate-400">
              /
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 md:hidden hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-rose-500"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-b border-white/10 bg-[#0d0f17] px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium tabular-nums ${
                    active
                      ? "bg-rose-600/15 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/popular"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium ${
                isActive("/popular")
                  ? "bg-rose-600/15 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              Popular
            </Link>
            <Link
              to="/download"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium ${
                isActive("/download")
                  ? "bg-rose-600/15 text-white"
                  : "text-rose-400 hover:bg-white/5 hover:text-rose-300"
              }`}
            >
              Get Android App / APK
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
};
