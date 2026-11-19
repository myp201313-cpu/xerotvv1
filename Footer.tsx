import React from "react";
import { Link } from "react-router-dom";
import { PWAInstallButton } from "./PWAInstallButton";

export const Footer: React.FC = () => {
  return (
    <footer className="mt-16 border-t border-white/[0.08] bg-[#07080c]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="font-display text-lg font-bold tracking-tight text-white">
            XEROTV
          </p>
          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            Early Access third-party streaming discovery and catalog sync client.
            Metadata and poster artwork powered by The Movie Database (TMDB).
          </p>
          <div className="pt-1">
            <PWAInstallButton variant="compact" />
          </div>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-400"
        >
          <Link to="/" className="hover:text-white transition-colors">
            Home
          </Link>
          <Link to="/movies" className="hover:text-white transition-colors">
            Movies
          </Link>
          <Link to="/tv-shows" className="hover:text-white transition-colors">
            TV Shows
          </Link>
          <Link to="/popular" className="hover:text-white transition-colors">
            Popular
          </Link>
          <Link to="/library" className="hover:text-white transition-colors">
            Library
          </Link>
          <Link to="/sync" className="hover:text-white transition-colors">
            Sync Hub
          </Link>
          <Link to="/download" className="text-rose-400 hover:text-rose-300 transition-colors">
            Get App / APK
          </Link>
          <Link to="/about" className="hover:text-white transition-colors">
            About
          </Link>
          <Link to="/disclaimer" className="hover:text-white transition-colors">
            Disclaimer
          </Link>
        </nav>
      </div>
    </footer>
  );
};
