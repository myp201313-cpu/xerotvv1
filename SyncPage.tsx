import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PWAInstallButton } from "../components/PWAInstallButton";
import {
  Check,
  Copy,
  Database,
  Download,
  KeyRound,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useSync } from "../context/SyncContext";
import { getClientCacheCount } from "../services/apiCache";

interface ServerStatus {
  tmdbConfigured: boolean;
  cacheEntries: number;
  cacheHits: number;
  cacheMisses: number;
  activeVaults: number;
  activeRooms: number;
  lastCatalogSyncAt: number | null;
}

export const SyncPage: React.FC = () => {
  const {
    vault,
    libraryCount,
    history,
    preferences,
    runtimeConfig,
    syncStatus,
    syncMessage,
    updatePreferences,
    pushSyncNow,
    linkSyncKey,
    generateNewSyncKey,
    refreshCatalogSync,
    exportVaultJson,
    importVaultJson,
  } = useSync();

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [linkFeedback, setLinkFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFeedback, setImportFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchServerStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status");
      if (res.ok) {
        const data = (await res.json()) as ServerStatus;
        setServerStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchServerStatus();
  }, [fetchServerStatus]);

  const handleCopyKey = async () => {
    if (!vault.syncKey) return;
    try {
      await navigator.clipboard.writeText(vault.syncKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkFeedback(null);
    const res = await linkSyncKey(linkInput);
    if (res.ok) {
      setLinkFeedback({
        type: "ok",
        text: "Sync Key linked and vault merged cleanly.",
      });
      setLinkInput("");
      void fetchServerStatus();
    } else {
      setLinkFeedback({
        type: "err",
        text: res.error || "Unable to link Sync Key.",
      });
    }
  };

  const handleCatalogRefresh = async () => {
    setRefreshingCatalog(true);
    setCatalogFeedback(null);
    const result = await refreshCatalogSync();
    await fetchServerStatus();
    setCatalogFeedback(
      `Cleared ${result.clearedCount} cached TMDB endpoints and synced fresh catalog metadata across tabs.`,
    );
    setRefreshingCatalog(false);
  };

  const handleDownloadBackup = () => {
    const json = exportVaultJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xerotv-vault-${vault.syncKey || "backup"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setImportFeedback(null);
    const res = importVaultJson(importText);
    if (res.ok) {
      setImportFeedback({
        type: "ok",
        text: "Backup merged into your active XEROTV vault.",
      });
      setImportText("");
    } else {
      setImportFeedback({
        type: "err",
        text: res.error || "Import failed.",
      });
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-10 sm:px-8">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Sync Hub &amp; Catalog Engine
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Synchronize your saved watchlist, continue-watching history, and streaming server
            preferences across browser tabs and devices without creating an account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PWAInstallButton />
          <Link
            to="/download"
            className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-medium text-slate-200 hover:bg-white/10"
          >
            Download APK
          </Link>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
          <p className="text-xs text-slate-400">Synced Watchlist</p>
          <p className="mt-1 font-display text-2xl font-bold text-white tabular-nums">
            {libraryCount}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
          <p className="text-xs text-slate-400">Watch History</p>
          <p className="mt-1 font-display text-2xl font-bold text-white tabular-nums">
            {history.length}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
          <p className="text-xs text-slate-400">TMDB Cache Entries</p>
          <p className="mt-1 font-display text-2xl font-bold text-white tabular-nums">
            {serverStatus ? serverStatus.cacheEntries : getClientCacheCount()}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
          <p className="text-xs text-slate-400">TMDB API Status</p>
          <p className="mt-1 font-display text-lg font-bold text-emerald-400">
            {serverStatus?.tmdbConfigured ? "Connected" : "Checking"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Cross-Device Vault Key */}
        <section className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white">
                Cross-Device Sync Key
              </h2>
              <p className="text-xs text-slate-400">
                Use this key on another browser or device to merge and sync your XEROTV vault.
              </p>
            </div>
            <KeyRound className="h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
            <code className="font-mono text-base font-semibold tracking-wider text-white tabular-nums">
              {vault.syncKey || "Provisioning..."}
            </code>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyKey}
                disabled={!vault.syncKey}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-slate-200 hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void pushSyncNow()}
                disabled={syncStatus === "syncing"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncStatus === "syncing" ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>Sync Now</span>
              </button>
            </div>
          </div>

          {syncMessage && (
            <p className="text-xs text-slate-300 tabular-nums">
              {syncMessage} · Last updated{" "}
              {new Date(vault.updatedAt).toLocaleTimeString()}
            </p>
          )}

          <form onSubmit={handleLinkSubmit} className="space-y-3 border-t border-white/[0.08] pt-4">
            <label htmlFor="link-sync-key" className="block text-xs font-medium text-slate-300">
              Link Existing Sync Key
            </label>
            <div className="flex gap-2">
              <input
                id="link-sync-key"
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="XERO-XXXX-XXXX"
                className="h-10 flex-1 rounded-lg border border-white/10 bg-[#090a0f] px-3 font-mono text-sm uppercase text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg border border-white/15 bg-white/[0.07] px-4 text-xs font-semibold text-white hover:bg-white/15 whitespace-nowrap"
              >
                Link &amp; Merge
              </button>
            </div>
            {linkFeedback && (
              <p
                className={`text-xs ${
                  linkFeedback.type === "ok" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {linkFeedback.text}
              </p>
            )}
          </form>

          <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
            <span className="text-xs text-slate-400">
              Need a separate vault for another profile?
            </span>
            <button
              type="button"
              onClick={() => void generateNewSyncKey()}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300"
            >
              Generate New Key
            </button>
          </div>
        </section>

        {/* TMDB Catalog Sync & Cache Diagnostics */}
        <section className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white">
                TMDB Catalog Sync
              </h2>
              <p className="text-xs text-slate-400">
                Refresh edge and browser TMDB caches to pull the newest posters, trending
                rankings, and episode air dates.
              </p>
            </div>
            <Database className="h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
          </div>

          <dl className="grid grid-cols-2 gap-4 border-y border-white/[0.08] py-4 text-xs tabular-nums">
            <div>
              <dt className="text-slate-400">Server Cache Hits</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-white">
                {serverStatus?.cacheHits ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Server Cache Misses</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-white">
                {serverStatus?.cacheMisses ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Client Memory Keys</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-white">
                {getClientCacheCount()}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Last Catalog Sync</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-white">
                {vault.lastCatalogSyncAt || serverStatus?.lastCatalogSyncAt
                  ? new Date(
                      vault.lastCatalogSyncAt || serverStatus!.lastCatalogSyncAt!,
                    ).toLocaleTimeString()
                  : "Active Session"}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={handleCatalogRefresh}
            disabled={refreshingCatalog}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshingCatalog ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>
              {refreshingCatalog ? "Refreshing Catalog..." : "Refresh TMDB Catalog Now"}
            </span>
          </button>

          {catalogFeedback && (
            <p className="text-xs text-emerald-400">{catalogFeedback}</p>
          )}
        </section>

        {/* Playback & Sync Preferences */}
        <section className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6">
          <h2 className="font-display text-xl font-bold text-white">
            Synced Playback Preferences
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="pref-server"
                className="block text-xs font-medium text-slate-300"
              >
                Preferred Mirror Server
              </label>
              <select
                id="pref-server"
                value={preferences.preferredServerIndex}
                onChange={(e) =>
                  updatePreferences({ preferredServerIndex: Number(e.target.value) })
                }
                className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
              >
                {runtimeConfig.servers.map((srv, idx) => (
                  <option key={srv.id} value={idx}>
                    {srv.name}
                    {srv.recommended ? " [Recommended]" : ""} ({srv.qualityHint})
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Default Iframe Sandbox</p>
                <p className="text-xs text-slate-400">
                  Block third-party embed popups and redirects by default.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.sandboxDefault}
                onChange={(e) =>
                  updatePreferences({ sandboxDefault: e.target.checked })
                }
                className="h-4 w-4 accent-rose-600"
              />
            </label>

            <label className="flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Real-Time Auto-Sync</p>
                <p className="text-xs text-slate-400">
                  Automatically push watchlist &amp; watch history edits to your Sync Key.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoSyncEnabled}
                onChange={(e) =>
                  updatePreferences({ autoSyncEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-rose-600"
              />
            </label>
          </div>
        </section>

        {/* Export / Import Backup */}
        <section className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#12141d] p-6">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-white">
              Portable Vault Backup
            </h2>
            <p className="text-xs text-slate-400">
              Export your complete library and history as JSON, or paste a backup file to
              restore and merge locally.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-4 text-xs font-semibold text-white hover:bg-white/10"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Download JSON Backup</span>
          </button>

          <form onSubmit={handleImportSubmit} className="space-y-3 border-t border-white/[0.08] pt-4">
            <label htmlFor="import-json" className="block text-xs font-medium text-slate-300">
              Restore / Merge JSON Backup
            </label>
            <textarea
              id="import-json"
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='Paste exported XEROTV JSON here...'
              className="w-full rounded-lg border border-white/10 bg-[#090a0f] p-3 font-mono text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!importText.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Import &amp; Merge Backup</span>
            </button>
            {importFeedback && (
              <p
                className={`text-xs ${
                  importFeedback.type === "ok" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {importFeedback.text}
              </p>
            )}
          </form>
        </section>
      </div>
    </div>
  );
};
