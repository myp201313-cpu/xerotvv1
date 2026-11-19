import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Monitor,
  PackageCheck,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { useSync } from "../context/SyncContext";

export const DownloadPage: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const { vault } = useSync();
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedApkUrl, setCopiedApkUrl] = useState(false);

  const directApkUrl =
    typeof window !== "undefined" ? `${window.location.origin}/XEROTV.apk` : "/XEROTV.apk";

  const handleInstallClick = async () => {
    const accepted = await install();
    if (accepted) {
      setInstallFeedback("XEROTV has been installed as an app shortcut on your device.");
    } else {
      setInstallFeedback(
        "Install prompt dismissed. You can install anytime from your browser menu.",
      );
    }
  };

  const handleCopyApkUrl = async () => {
    try {
      await navigator.clipboard.writeText(directApkUrl);
      setCopiedApkUrl(true);
      setTimeout(() => setCopiedApkUrl(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  const handleCopySyncKey = async () => {
    if (!vault.syncKey) return;
    try {
      await navigator.clipboard.writeText(vault.syncKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-10 px-4 py-10 sm:px-8">
      <div className="space-y-2 border-b border-white/[0.08] pb-6">
        <p className="text-xs font-semibold tracking-wider text-rose-400">
          Mobile &amp; Windows Distribution
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Download XEROTV App &amp; Desktop Shortcut
        </h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Install XEROTV directly on Android via <code className="text-slate-200">/XEROTV.apk</code>,
          add a one-click Windows Desktop shortcut, or launch standalone on iOS and Chrome.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 1. Direct Native Android APK URL Only */}
        <section className="flex flex-col justify-between space-y-6 rounded-2xl border border-rose-500/30 bg-[#12141d] p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-white">
                  1. Android APK
                </h2>
                <p className="text-xs text-slate-400">
                  Direct binary <code className="text-slate-200">XEROTV.apk</code> package
                  (<code className="text-slate-200">tv.xero.app</code>) for Android 5.0+.
                </p>
              </div>
              <PackageCheck className="h-6 w-6 shrink-0 text-rose-400" aria-hidden="true" />
            </div>

            <ul className="space-y-2 border-y border-white/[0.08] py-4 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Direct APK download URL — no archive extraction needed</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Fullscreen landscape player &amp; hardware back navigation</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Built-in cookie persistence &amp; redirect protection</span>
              </li>
            </ul>

            <a
              href="/XEROTV.apk"
              download="XEROTV.apk"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download XEROTV.apk</span>
            </a>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#090a0f] px-3 py-2">
              <code className="truncate font-mono text-[11px] text-slate-300">
                {directApkUrl}
              </code>
              <button
                type="button"
                onClick={handleCopyApkUrl}
                className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/10"
              >
                {copiedApkUrl ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-[#090a0f] p-4 text-xs text-slate-400">
            <p className="font-semibold text-white">Android Install Steps:</p>
            <p>1. Tap Download XEROTV.apk or open the direct URL on Android.</p>
            <p>2. Open the APK file and allow installs from your browser if prompted.</p>
          </div>
        </section>

        {/* 2. Windows Desktop Shortcut */}
        <section className="flex flex-col justify-between space-y-6 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-white">
                  2. Windows Shortcut
                </h2>
                <p className="text-xs text-slate-400">
                  Native Windows Desktop shortcut (<code className="text-slate-200">XEROTV.url</code>)
                  and Edge/Chrome Desktop App launcher.
                </p>
              </div>
              <Monitor className="h-6 w-6 shrink-0 text-rose-400" aria-hidden="true" />
            </div>

            <ul className="space-y-2 border-y border-white/[0.08] py-4 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Standard Windows Desktop &amp; Start Menu shortcut</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Double-click from Desktop on Windows 10 &amp; Windows 11</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Supports standalone Edge/Chrome taskbar pinning</span>
              </li>
            </ul>

            <div className="space-y-2.5">
              <a
                href="/XEROTV.url"
                download="XEROTV.url"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 whitespace-nowrap"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Download Windows Shortcut (.url)</span>
              </a>

              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-600/15 px-4 text-xs font-semibold text-rose-200 hover:bg-rose-600 hover:text-white transition-colors"
                >
                  <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pin as Windows App Window</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-[#090a0f] p-4 text-xs text-slate-400">
            <p className="font-semibold text-white">Windows Desktop Setup:</p>
            <p>1. Download <code className="text-slate-200">XEROTV.url</code> and move it to your Windows Desktop.</p>
            <p>2. Optional: In Chrome/Edge, open <strong className="text-slate-200">Menu → Cast, save, and share → Create shortcut</strong> to pin a dedicated app window.</p>
          </div>
        </section>

        {/* 3. Instant Mobile WebAPK / iOS Home Screen Install */}
        <section className="flex flex-col justify-between space-y-6 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-white">
                  3. Mobile &amp; iOS WebApp
                </h2>
                <p className="text-xs text-slate-400">
                  Zero-sideload standalone app via Android Chrome &amp; iOS Safari with
                  offline TMDB poster caching.
                </p>
              </div>
              <Smartphone className="h-6 w-6 shrink-0 text-rose-400" aria-hidden="true" />
            </div>

            <ul className="space-y-2 border-y border-white/[0.08] py-4 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Offline app shell &amp; poster caching via Service Worker</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Full-screen Home Screen app on iPhone &amp; iPad</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Automatic updates whenever new streaming mirrors ship</span>
              </li>
            </ul>

            {isInstalled ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">
                XEROTV is already running in standalone installed app mode on this device.
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Install XEROTV WebApp</span>
              </button>
            ) : null}

            {installFeedback && (
              <p className="text-xs text-emerald-400">{installFeedback}</p>
            )}
          </div>

          <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-[#090a0f] p-4 text-xs text-slate-400">
            <p className="font-semibold text-white">
              {isIOS
                ? "iPhone / iPad (Safari):"
                : isAndroid
                  ? "Android Chrome:"
                  : "Chrome / Safari / Edge:"}
            </p>
            {isIOS ? (
              <ol className="space-y-1">
                <li>1. Open XEROTV in Safari on iOS.</li>
                <li>2. Tap Share → Add to Home Screen, then tap Add.</li>
              </ol>
            ) : (
              <ol className="space-y-1">
                <li>1. Open XEROTV in a top-level browser tab.</li>
                <li>2. Tap menu (⋮) → Install App / Add to Home Screen.</li>
              </ol>
            )}
          </div>
        </section>
      </div>

      {/* Sync Key Pairing Strip */}
      <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound className="h-4 w-4 text-rose-400" aria-hidden="true" />
            <span>Pair Your Android, Windows &amp; Web Devices</span>
          </p>
          <p className="text-xs text-slate-400">
            Enter your Sync Key in the Sync Hub tab on any device to carry over your
            watchlist, mirror preferences, and resume history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-[#090a0f] px-3.5 py-2 font-mono text-sm font-semibold text-white tabular-nums">
            {vault.syncKey || "Provisioning..."}
          </code>
          <button
            type="button"
            onClick={handleCopySyncKey}
            disabled={!vault.syncKey}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {copiedKey ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy Key</span>
              </>
            )}
          </button>
          <Link
            to="/sync"
            className="inline-flex h-10 items-center rounded-lg border border-white/10 px-3.5 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            Open Sync Hub
          </Link>
        </div>
      </section>
    </div>
  );
};
