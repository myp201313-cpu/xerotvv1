import React from "react";
import { Link } from "react-router-dom";

export const AboutPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-8">
      <div className="space-y-2 border-b border-white/[0.08] pb-6">
        <p className="text-xs font-semibold tracking-wider text-rose-400">
          Early Access Release
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
          About XEROTV
        </h1>
        <p className="text-sm text-slate-400">
          Ad-free third-party streaming discovery, live TMDB metadata, and cross-device
          catalog synchronization.
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-slate-300">
        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            Architecture &amp; Open-Source Foundation
          </h2>
          <p>
            XEROTV builds upon open-source streaming discovery patterns from{" "}
            <a
              href="https://github.com/cd-Crypton/mstream"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 underline underline-offset-4 hover:text-rose-300"
            >
              mstream
            </a>
            ,{" "}
            <a
              href="https://github.com/wisnuwirayuda15/cinextma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 underline underline-offset-4 hover:text-rose-300"
            >
              Cinextma
            </a>
            ,{" "}
            <a
              href="https://github.com/truelockmc/streambert"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 underline underline-offset-4 hover:text-rose-300"
            >
              Streambert
            </a>
            , and{" "}
            <a
              href="https://github.com/cinepro-org/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 underline underline-offset-4 hover:text-rose-300"
            >
              Cinepro Core
            </a>
            : multi-tier caching, server-side TMDB API proxying, real-time player event
            sync, and isolated multi-mirror playback with configurable sandbox protection.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            Sync Engine &amp; Early Access Features
          </h2>
          <p>
            Without requiring personal accounts or passwords, XEROTV provisions an
            anonymous Sync Key (<code className="font-mono text-white">XERO-XXXX-XXXX</code>)
            that keeps your saved watchlist, continue-watching history, and mirror server
            preferences synchronized across tabs and linked browsers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold text-white">
            Key Highlights
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                title: "Live Trending Catalog",
                desc: "Weekly and daily TMDB rankings across movies, series, and anime.",
              },
              {
                title: "Instant Multi-Search",
                desc: "Keyboard-first search (/ or Cmd+K) with zero-latency filtering.",
              },
              {
                title: "Sandbox-Verified Mirrors + Rooms",
                desc: "Vidzen, NXSHA, and VidZee failover, sandbox protection, real downloads, and Watch Sync Rooms.",
              },
              {
                title: "Android APK & Mobile WebAPK",
                desc: "Download XEROTV.apk directly or install standalone on mobile and desktop.",
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4"
              >
                <h3 className="font-display text-sm font-bold text-white">
                  {feat.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            TMDB Metadata Attribution
          </h2>
          <p>
            All film and television titles, synopses, cast lists, trailers, ratings, and
            poster artwork are fetched via The Movie Database (TMDB) API. XEROTV is not
            endorsed or certified by TMDB.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap gap-5 border-t border-white/[0.08] pt-6 text-sm font-medium">
        <Link to="/download" className="text-rose-400 hover:text-rose-300">
          Get Android App / APK →
        </Link>
        <Link to="/sync" className="text-slate-200 hover:text-white">
          Open Sync Hub
        </Link>
        <Link to="/disclaimer" className="text-slate-300 hover:text-white">
          View Disclaimer
        </Link>
        <Link to="/" className="text-slate-300 hover:text-white">
          Back to Home
        </Link>
      </div>
    </div>
  );
};
