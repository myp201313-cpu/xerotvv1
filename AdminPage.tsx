import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Database,
  HardDriveDownload,
  Lock,
  LogOut,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Sliders,
  Trash2,
} from "lucide-react";
import { useSync } from "../context/SyncContext";
import type { AdminConfig, StreamingServer } from "../types/media";

interface AdminVaultRow {
  syncKey: string;
  libraryCount: number;
  historyCount: number;
  updatedAt: number;
  deviceId: string;
}

interface AdminRoomRow {
  roomCode: string;
  title: string;
  mediaType: "movie" | "tv";
  mediaId: number;
  serverIndex: number;
  updatedAt: number;
}

interface AdminOverviewResponse {
  config: AdminConfig;
  servers: StreamingServer[];
  mirrorHealth: {
    checkedAt: number;
    servers: { id: string; ok: boolean; sandboxCompatible?: boolean; status: number; latencyMs: number }[];
  } | null;
  stats: {
    tmdbConfigured: boolean;
    tmdbCacheEntries: number;
    downloadCacheEntries: number;
    cacheHits: number;
    cacheMisses: number;
    activeVaults: number;
    activeRooms: number;
    lastCatalogSyncAt: number | null;
  };
  vaults: AdminVaultRow[];
  rooms: AdminRoomRow[];
}

type AdminSection = "mirrors" | "platform" | "vaults" | "distribution";

export const AdminPage: React.FC = () => {
  const { refreshRuntimeConfig } = useSync();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [section, setSection] = useState<AdminSection>("mirrors");
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [draftConfig, setDraftConfig] = useState<AdminConfig | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [probingHealth, setProbingHealth] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch("/api/admin/overview");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load overview");
      const data = (await res.json()) as AdminOverviewResponse;
      setOverview(data);
      setDraftConfig(data.config);
    } catch {
      setNotice("Could not load admin telemetry from server.");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data: { authenticated?: boolean }) => {
        const ok = Boolean(data.authenticated);
        setAuthenticated(ok);
        setAuthChecked(true);
        if (ok) void loadOverview();
      })
      .catch(() => {
        setAuthenticated(false);
        setAuthChecked(true);
      });
  }, [loadOverview]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setLoginError(err.error || "Access denied");
        return;
      }
      setPasscode("");
      setAuthenticated(true);
      await loadOverview();
    } catch {
      setLoginError("Unable to reach authentication service.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setAuthenticated(false);
    setOverview(null);
    setDraftConfig(null);
  };

  const handleSaveConfig = async (nextConfig: AdminConfig) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = (await res.json()) as { config: AdminConfig };
      setDraftConfig(data.config);
      await Promise.all([loadOverview(), refreshRuntimeConfig(true)]);
      setNotice("Configuration saved and broadcast to active viewers.");
    } catch {
      setNotice("Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveServer = (serverId: string, direction: -1 | 1) => {
    if (!draftConfig || !overview) return;
    const ordered = [...overview.servers].sort(
      (a, b) =>
        (draftConfig.serverOverrides[a.id]?.order ?? 0) -
        (draftConfig.serverOverrides[b.id]?.order ?? 0),
    );
    const idx = ordered.findIndex((s) => s.id === serverId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    [ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]];

    const nextOverrides = { ...draftConfig.serverOverrides };
    ordered.forEach((srv, i) => {
      nextOverrides[srv.id] = {
        enabled: nextOverrides[srv.id]?.enabled ?? true,
        recommended: nextOverrides[srv.id]?.recommended ?? Boolean(srv.recommended),
        order: i,
      };
    });
    const nextConfig: AdminConfig = { ...draftConfig, serverOverrides: nextOverrides };
    setDraftConfig(nextConfig);
    void handleSaveConfig(nextConfig);
  };

  const handleToggleServerField = (
    serverId: string,
    field: "enabled" | "recommended",
  ) => {
    if (!draftConfig) return;
    const cur = draftConfig.serverOverrides[serverId] || {
      enabled: true,
      recommended: false,
      order: 0,
    };
    const nextOverrides = {
      ...draftConfig.serverOverrides,
      [serverId]: {
        ...cur,
        [field]: !cur[field],
      },
    };
    const nextConfig: AdminConfig = { ...draftConfig, serverOverrides: nextOverrides };
    setDraftConfig(nextConfig);
    void handleSaveConfig(nextConfig);
  };

  const handleClearCache = async (scope: "all" | "tmdb" | "downloads" | "health") => {
    setNotice(null);
    const res = await fetch("/api/admin/cache/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    if (res.ok) {
      await loadOverview();
      setNotice(`Cleared ${scope} caches cleanly.`);
    }
  };

  const handleProbeMirrors = async () => {
    setProbingHealth(true);
    try {
      await fetch("/api/servers/health?fresh=1");
      await loadOverview();
      setNotice("Mirror sandbox reachability probe completed.");
    } finally {
      setProbingHealth(false);
    }
  };

  const handleDeleteVault = async (syncKey: string) => {
    const res = await fetch(`/api/admin/vaults/${encodeURIComponent(syncKey)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadOverview();
      setNotice(`Revoked Sync Vault ${syncKey}.`);
    }
  };

  const handleCloseRoom = async (roomCode: string) => {
    const res = await fetch(`/api/admin/rooms/${encodeURIComponent(roomCode)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadOverview();
      setNotice(`Closed Watch Sync Room ${roomCode}.`);
    }
  };

  if (!authChecked) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-slate-400">
        Verifying session...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-16">
        <div className="w-full space-y-6 rounded-xl border border-white/10 bg-[#12141d] p-7">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Restricted Control Access</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              XEROTV Control Console
            </h1>
            <p className="text-xs text-slate-400">
              Enter your administrator passcode to manage mirrors, downloads, caches, and sync vaults.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-passcode" className="block text-xs font-medium text-slate-300">
                Administrator Passcode
              </label>
              <input
                id="admin-passcode"
                type="password"
                autoComplete="current-password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-400">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={loggingIn || !passcode}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {loggingIn ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const orderedServers = (overview?.servers || []).slice().sort((a, b) => {
    const oa = draftConfig?.serverOverrides[a.id]?.order ?? 0;
    const ob = draftConfig?.serverOverrides[b.id]?.order ?? 0;
    return oa - ob;
  });

  const healthMap = new Map(
    (overview?.mirrorHealth?.servers || []).map((s) => [s.id, s]),
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
      {/* Top Bar Contract: Breadcrumb Left, 1-2 Actions Right */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
            XEROTV / Admin Control / Runtime Operations
          </p>
          <h1 className="font-display text-2xl font-bold text-white">
            Operations &amp; Playback Console
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loadingOverview}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-[#12141d] px-3.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingOverview ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Refresh State</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3.5 text-xs font-medium text-white hover:bg-white/10 whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lock Session</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* Workspace Canvas: Sidebar (240px) + Main Viewport */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1.5 rounded-xl border border-white/[0.08] bg-[#12141d] p-3 h-fit">
          {[
            { id: "mirrors" as const, label: "Mirrors & Sandbox", icon: Server },
            { id: "platform" as const, label: "Features & Cache", icon: Sliders },
            { id: "vaults" as const, label: "Sync Vaults & Rooms", icon: Database },
            { id: "distribution" as const, label: "APK & Cloudflare", icon: HardDriveDownload },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  active
                    ? "bg-rose-600 text-white"
                    : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="space-y-6">
          {/* Compact Tabular Metrics Row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
              <p className="text-[11px] text-slate-400">Active Mirrors</p>
              <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                {orderedServers.filter((s) => draftConfig?.serverOverrides[s.id]?.enabled !== false).length}
                /{orderedServers.length}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
              <p className="text-[11px] text-slate-400">Sync Vaults</p>
              <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                {overview?.stats.activeVaults ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
              <p className="text-[11px] text-slate-400">TMDB Cache Keys</p>
              <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                {overview?.stats.tmdbCacheEntries ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4">
              <p className="text-[11px] text-slate-400">Download Cache</p>
              <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                {overview?.stats.downloadCacheEntries ?? 0}
              </p>
            </div>
          </div>

          {/* Section 1: Mirrors & Sandbox */}
          {section === "mirrors" && draftConfig && (
            <section className="space-y-4 rounded-xl border border-white/[0.08] bg-[#12141d] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    Sandbox-Verified Streaming Mirrors
                  </h2>
                  <p className="text-xs text-slate-400">
                    Reorder playback servers, manage recommended tags, or disable a mirror globally.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleProbeMirrors()}
                  disabled={probingHealth}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-semibold text-white hover:bg-white/10"
                >
                  <Shield className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>{probingHealth ? "Probing..." : "Run Live Sandbox Probe"}</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400">
                      <th className="py-2.5 pr-3 font-medium">Order</th>
                      <th className="py-2.5 px-3 font-medium">Server</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                      <th className="py-2.5 px-3 font-medium">Recommended</th>
                      <th className="py-2.5 px-3 font-medium">Default</th>
                      <th className="py-2.5 pl-3 text-right font-medium">Enabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {orderedServers.map((srv, idx) => {
                      const ov = draftConfig.serverOverrides[srv.id] || {
                        enabled: true,
                        recommended: Boolean(srv.recommended),
                        order: idx,
                      };
                      const h = healthMap.get(srv.id);
                      return (
                        <tr key={srv.id} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 pr-3">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Move ${srv.providerLabel} up`}
                                disabled={idx === 0}
                                onClick={() => handleMoveServer(srv.id, -1)}
                                className="rounded border border-white/10 p-1 text-slate-300 hover:bg-white/10 disabled:opacity-30"
                              >
                                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${srv.providerLabel} down`}
                                disabled={idx === orderedServers.length - 1}
                                onClick={() => handleMoveServer(srv.id, 1)}
                                className="rounded border border-white/10 p-1 text-slate-300 hover:bg-white/10 disabled:opacity-30"
                              >
                                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-white">{srv.name}</p>
                            <p className="font-mono text-[11px] text-slate-400">{srv.id}</p>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            {h ? (
                              <span
                                className={
                                  h.ok ? "text-emerald-400" : "text-amber-400"
                                }
                              >
                                {h.ok ? "OK" : "Fallback"} · {h.latencyMs}ms
                              </span>
                            ) : (
                              <span className="text-slate-400">Sandbox Verified</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => handleToggleServerField(srv.id, "recommended")}
                              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                                ov.recommended
                                  ? "border-rose-500/40 bg-rose-600/20 text-rose-200"
                                  : "border-white/10 bg-[#090a0f] text-slate-400"
                              }`}
                            >
                              {ov.recommended ? "Recommended" : "Standard"}
                            </button>
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="radio"
                              name="defaultServerId"
                              aria-label={`Set ${srv.providerLabel} as default`}
                              checked={draftConfig.defaultServerId === srv.id}
                              onChange={() => {
                                const next = { ...draftConfig, defaultServerId: srv.id };
                                setDraftConfig(next);
                                void handleSaveConfig(next);
                              }}
                              className="accent-rose-600"
                            />
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <input
                              type="checkbox"
                              aria-label={`Enable ${srv.providerLabel}`}
                              checked={ov.enabled}
                              onChange={() => handleToggleServerField(srv.id, "enabled")}
                              className="h-4 w-4 accent-rose-600"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Section 2: Feature & Cache Controls */}
          {section === "platform" && draftConfig && (
            <section className="space-y-5 rounded-xl border border-white/[0.08] bg-[#12141d] p-5">
              <h2 className="font-display text-lg font-bold text-white">
                Platform Feature Toggles &amp; Caches
              </h2>

              <div className="space-y-3">
                {[
                  {
                    key: "enforceSandbox" as const,
                    title: "Enforce Iframe Sandbox Policy",
                    desc: "Keep popup-blocking sandbox active on all embedded players by default.",
                  },
                  {
                    key: "downloadsEnabled" as const,
                    title: "Real Movie / Episode Downloads Engine",
                    desc: "Enable live MP4, MKV, and VTT subtitle resolution on Watch pages.",
                  },
                  {
                    key: "roomsEnabled" as const,
                    title: "Watch Sync Rooms",
                    desc: "Allow viewers to create and join synchronized room links.",
                  },
                  {
                    key: "catalogAutoSync" as const,
                    title: "Automatic Catalog Sync",
                    desc: "Keep TMDB cache refreshed across active browser tabs.",
                  },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-[#090a0f] p-3.5 cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={draftConfig[item.key]}
                      onChange={(e) => {
                        const next = { ...draftConfig, [item.key]: e.target.checked };
                        setDraftConfig(next);
                        void handleSaveConfig(next);
                      }}
                      className="h-4 w-4 accent-rose-600"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="admin-announcement" className="block text-xs font-medium text-slate-300">
                    Global Announcement Banner (Optional)
                  </label>
                  <input
                    id="admin-announcement"
                    type="text"
                    value={draftConfig.announcement}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, announcement: e.target.value })
                    }
                    placeholder="Leave empty to hide banner"
                    className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="admin-ttl" className="block text-xs font-medium text-slate-300">
                    TMDB Cache TTL (Minutes)
                  </label>
                  <input
                    id="admin-ttl"
                    type="number"
                    min={1}
                    max={240}
                    value={draftConfig.tmdbCacheTtlMinutes}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        tmdbCacheTtlMinutes: Number(e.target.value) || 20,
                      })
                    }
                    className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 font-mono text-xs text-white focus:border-rose-500 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveConfig(draftConfig)}
                  className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Platform Settings"}
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleClearCache("tmdb")}
                    className="h-9 rounded-lg border border-white/10 bg-[#090a0f] px-3 text-xs text-slate-200 hover:bg-white/10"
                  >
                    Flush TMDB Cache
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearCache("downloads")}
                    className="h-9 rounded-lg border border-white/10 bg-[#090a0f] px-3 text-xs text-slate-200 hover:bg-white/10"
                  >
                    Flush Download Cache
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearCache("all")}
                    className="h-9 rounded-lg border border-rose-500/30 bg-rose-600/15 px-3 text-xs font-medium text-rose-200 hover:bg-rose-600 hover:text-white"
                  >
                    Flush All Caches
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Section 3: Sync Vaults & Rooms */}
          {section === "vaults" && (
            <div className="space-y-6">
              <section className="space-y-3 rounded-xl border border-white/[0.08] bg-[#12141d] p-5">
                <h2 className="font-display text-lg font-bold text-white">
                  Active Sync Vaults
                </h2>
                {(!overview?.vaults || overview.vaults.length === 0) ? (
                  <p className="text-xs text-slate-400">
                    No active Sync Vaults stored yet. Vaults appear automatically when devices sync.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs tabular-nums">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Sync Key</th>
                          <th className="py-2 px-3 font-medium">Library</th>
                          <th className="py-2 px-3 font-medium">History</th>
                          <th className="py-2 px-3 font-medium">Updated</th>
                          <th className="py-2 pl-3 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {overview.vaults.map((v) => (
                          <tr key={v.syncKey}>
                            <td className="py-2.5 pr-3 font-mono font-semibold text-white">
                              {v.syncKey}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              {v.libraryCount}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              {v.historyCount}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {new Date(v.updatedAt).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <button
                                type="button"
                                onClick={() => void handleDeleteVault(v.syncKey)}
                                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-600/20"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                <span>Revoke</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-white/[0.08] bg-[#12141d] p-5">
                <h2 className="font-display text-lg font-bold text-white">
                  Active Watch Sync Rooms
                </h2>
                {(!overview?.rooms || overview.rooms.length === 0) ? (
                  <p className="text-xs text-slate-400">
                    No active Watch Sync Rooms right now.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs tabular-nums">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Room</th>
                          <th className="py-2 px-3 font-medium">Title</th>
                          <th className="py-2 px-3 font-medium">Updated</th>
                          <th className="py-2 pl-3 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {overview.rooms.map((r) => (
                          <tr key={r.roomCode}>
                            <td className="py-2.5 pr-3 font-mono font-semibold text-white">
                              <span className="inline-flex items-center gap-1.5">
                                <Radio className="h-3 w-3 text-rose-400" aria-hidden="true" />
                                {r.roomCode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-200">{r.title}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {new Date(r.updatedAt).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <button
                                type="button"
                                onClick={() => void handleCloseRoom(r.roomCode)}
                                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-600/20"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                <span>Close</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Section 4: Distribution & Cloudflare Pages */}
          {section === "distribution" && (
            <section className="space-y-4 rounded-xl border border-white/[0.08] bg-[#12141d] p-5">
              <h2 className="font-display text-lg font-bold text-white">
                App Distribution &amp; Cloudflare Pages Targets
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0f] p-4 space-y-1.5">
                  <p className="font-semibold text-white">Signed Android APK</p>
                  <p className="font-mono text-slate-400">GET /XEROTV.apk (tv.xero.app)</p>
                  <a
                    href="/XEROTV.apk"
                    download="XEROTV.apk"
                    className="inline-flex items-center gap-1.5 font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Verify Direct APK Download →
                  </a>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0f] p-4 space-y-1.5">
                  <p className="font-semibold text-white">Windows Desktop Shortcut</p>
                  <p className="font-mono text-slate-400">GET /XEROTV.url</p>
                  <a
                    href="/XEROTV.url"
                    download="XEROTV.url"
                    className="inline-flex items-center gap-1.5 font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Verify Windows Shortcut →
                  </a>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0f] p-4 space-y-1.5">
                  <p className="font-semibold text-white">Cloudflare Pages Functions</p>
                  <p className="font-mono text-slate-400">
                    wrangler.jsonc + functions/api/[[path]].ts
                  </p>
                  <p className="text-slate-400">
                    Edge TMDB Proxy, Edge Cache, Real Downloads &amp; Runtime Config ready.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0f] p-4 space-y-1.5">
                  <p className="font-semibold text-white">TMDB API Credentials</p>
                  <p
                    className={`font-mono font-semibold ${
                      overview?.stats.tmdbConfigured ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {overview?.stats.tmdbConfigured ? "Configured & Active" : "Not Configured"}
                  </p>
                  <p className="font-mono text-slate-400">
                    Hits: {overview?.stats.cacheHits ?? 0} · Misses:{" "}
                    {overview?.stats.cacheMisses ?? 0}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
