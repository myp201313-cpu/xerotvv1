import React from "react";
import { Link } from "react-router-dom";

export const DisclaimerPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-8">
      <div className="space-y-2 border-b border-white/[0.08] pb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Third-Party Streaming Disclaimer
        </h1>
        <p className="text-sm text-slate-400">
          Important notice regarding media indexing, external embeds, and rights holders.
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-slate-300">
        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            No Hosted Video Files
          </h2>
          <p>
            <strong className="text-white">
              XEROTV does not host, upload, store, or stream any video files on its own
              servers.
            </strong>{" "}
            All playback mirrors are external third-party iframe embeds, and all metadata
            is retrieved from public APIs including The Movie Database (TMDB).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            Intellectual Property &amp; Official Services
          </h2>
          <p>
            All trademarks, film titles, posters, and copyrighted assets belong to their
            respective studios and rights holders. Users are responsible for complying
            with applicable copyright laws in their jurisdiction and are encouraged to
            support creators via official licensed platforms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            Browser Sandbox Protection
          </h2>
          <p>
            XEROTV defaults to sandboxed iframe playback where supported to block unwanted
            popups and redirects from external third-party mirrors. Disabling sandbox mode
            for incompatible mirrors is done at the user&apos;s discretion.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">
            User Responsibility &amp; Metadata Attribution
          </h2>
          <p>
            Users are solely responsible for complying with local laws and ensuring lawful
            access rights in their territory. Movie and TV metadata, ratings, cast lists,
            and poster artwork are sourced from The Movie Database (TMDB) API.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#12141d] p-5">
          <h2 className="font-display text-lg font-bold text-white">
            Support Official Streaming Platforms
          </h2>
          <p className="text-xs text-slate-400">
            Support filmmakers, studios, and creators through official licensed services:
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1 text-xs font-semibold">
            {[
              { name: "Netflix", url: "https://netflix.com" },
              { name: "Hulu", url: "https://hulu.com" },
              { name: "Disney+", url: "https://disneyplus.com" },
              { name: "Max", url: "https://max.com" },
              { name: "Prime Video", url: "https://amazon.com/primevideo" },
            ].map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-[#090a0f] px-3.5 text-slate-200 transition-colors hover:border-rose-500/50 hover:text-white"
              >
                {platform.name}
              </a>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-white/[0.08] pt-6 text-sm font-medium">
        <Link to="/about" className="text-rose-400 hover:text-rose-300">
          About XEROTV
        </Link>
        <Link to="/download" className="text-slate-300 hover:text-white">
          Android App / APK
        </Link>
        <Link to="/" className="text-slate-300 hover:text-white">
          Back to Home
        </Link>
      </div>
    </div>
  );
};
