import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  LibraryEntry,
  MediaType,
  RuntimeConfig,
  SyncPreferences,
  SyncVaultPayload,
  TMDBMediaItem,
  WatchHistoryEntry,
} from "../types/media";
import { clearApiCache } from "../services/apiCache";
import { getDeviceId, touchSession } from "../services/sessionManager";
import {
  formatSyncCode,
  isValidSyncCode,
  mergeSyncVaults,
  normalizeLibraryEntry,
  resolveMediaType,
  STREAMING_SERVERS,
} from "../utils/catalogLogic";

const VAULT_STORAGE_KEY = "xerotv_sync_vault_v1";
const SYNC_CHANNEL_NAME = "xerotv_sync_channel";

const DEFAULT_PREFERENCES: SyncPreferences = {
  preferredServerIndex: 0,
  sandboxDefault: true,
  autoSyncEnabled: true,
  region: "US",
  language: "en-US",
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  servers: STREAMING_SERVERS,
  defaultServerId: STREAMING_SERVERS[0].id,
  enforceSandbox: true,
  downloadsEnabled: true,
  roomsEnabled: true,
  catalogAutoSync: true,
  announcement: "",
};

function loadInitialVault(): SyncVaultPayload {
  const deviceId = getDeviceId();
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SyncVaultPayload;
      return {
        syncKey: parsed.syncKey || "",
        deviceId: parsed.deviceId || deviceId,
        library: Array.isArray(parsed.library) ? parsed.library : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) },
        lastCatalogSyncAt: parsed.lastCatalogSyncAt || null,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    syncKey: "",
    deviceId,
    library: [],
    history: [],
    preferences: DEFAULT_PREFERENCES,
    lastCatalogSyncAt: null,
    updatedAt: Date.now(),
  };
}

interface SyncContextValue {
  vault: SyncVaultPayload;
  library: LibraryEntry[];
  libraryCount: number;
  history: WatchHistoryEntry[];
  preferences: SyncPreferences;
  runtimeConfig: RuntimeConfig;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  syncMessage: string | null;
  catalogRefreshTick: number;
  refreshRuntimeConfig: (broadcast?: boolean) => Promise<void>;
  isInLibrary: (id: number | string, type?: MediaType) => boolean;
  addToLibrary: (item: TMDBMediaItem | LibraryEntry, genreMap?: Map<number, string>) => void;
  removeFromLibrary: (id: number | string, type?: MediaType) => void;
  toggleLibrary: (item: TMDBMediaItem | LibraryEntry, genreMap?: Map<number, string>) => void;
  clearLibrary: () => void;
  recordWatchHistory: (entry: WatchHistoryEntry) => void;
  removeHistoryItem: (id: number | string, mediaType: MediaType) => void;
  clearHistory: () => void;
  updatePreferences: (partial: Partial<SyncPreferences>) => void;
  pushSyncNow: () => Promise<SyncVaultPayload | null>;
  linkSyncKey: (code: string) => Promise<{ ok: boolean; error?: string }>;
  generateNewSyncKey: () => Promise<string | null>;
  refreshCatalogSync: () => Promise<{ clearedCount: number; lastCatalogSyncAt: number }>;
  importVaultJson: (jsonText: string) => { ok: boolean; error?: string };
  exportVaultJson: () => string;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vault, setVault] = useState<SyncVaultPayload>(loadInitialVault);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [catalogRefreshTick, setCatalogRefreshTick] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOnlinePushRef = useRef(false);

  const refreshRuntimeConfig = useCallback(async (broadcast = false) => {
    try {
      const res = await fetch("/api/config/runtime");
      if (!res.ok) return;
      const cfg = (await res.json()) as RuntimeConfig;
      if (Array.isArray(cfg?.servers) && cfg.servers.length > 0) {
        setRuntimeConfig(cfg);
        if (broadcast && channelRef.current) {
          try {
            channelRef.current.postMessage({ type: "RUNTIME_CONFIG_REFRESH" });
          } catch {
            // ignore channel closed
          }
        }
      }
    } catch {
      // keep existing runtime defaults if offline
    }
  }, []);

  useEffect(() => {
    void refreshRuntimeConfig();
  }, [refreshRuntimeConfig]);

  const persistLocalVault = useCallback((nextVault: SyncVaultPayload, broadcast = true) => {
    setVault(nextVault);
    vaultRef.current = nextVault;
    try {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(nextVault));
      touchSession();
    } catch {
      // ignore quota errors
    }
    if (broadcast && channelRef.current) {
      try {
        channelRef.current.postMessage({ type: "VAULT_UPDATE", payload: nextVault });
      } catch {
        // ignore channel closed
      }
    }
  }, []);

  // Initialize BroadcastChannel & localStorage cross-tab listener (without echoing server PUTs)
  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === "VAULT_UPDATE" && event.data?.payload) {
          const incoming = event.data.payload as SyncVaultPayload;
          vaultRef.current = incoming;
          setVault(incoming);
        } else if (event.data?.type === "CATALOG_REFRESH") {
          clearApiCache();
          setCatalogRefreshTick((t) => t + 1);
        } else if (event.data?.type === "RUNTIME_CONFIG_REFRESH") {
          void refreshRuntimeConfig();
        }
      };
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === VAULT_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as SyncVaultPayload;
          vaultRef.current = parsed;
          setVault(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [refreshRuntimeConfig]);

  const syncWithServer = useCallback(
    async (targetVault: SyncVaultPayload): Promise<SyncVaultPayload | null> => {
      if (!targetVault.syncKey) return null;
      setSyncStatus("syncing");
      try {
        const res = await fetch(
          `/api/sync/vault/${encodeURIComponent(targetVault.syncKey)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(targetVault),
          },
        );
        if (!res.ok) throw new Error("Sync server unavailable");
        const remote = (await res.json()) as SyncVaultPayload;
        const merged = mergeSyncVaults(targetVault, remote);
        persistLocalVault(merged, true);
        pendingOnlinePushRef.current = false;
        setSyncStatus("synced");
        setSyncMessage("Vault synced across tabs and server");
        return merged;
      } catch {
        pendingOnlinePushRef.current = true;
        setSyncStatus("error");
        setSyncMessage("Saved locally; waiting to sync with server");
        return null;
      }
    },
    [persistLocalVault],
  );

  // Boot reconciliation: provision new Sync Key if empty, OR pull/re-register existing Sync Key cleanly
  useEffect(() => {
    let active = true;
    const bootstrapSync = async () => {
      const current = vaultRef.current;
      if (!current.syncKey) {
        try {
          const res = await fetch("/api/sync/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(current),
          });
          if (!res.ok) return;
          const created = (await res.json()) as SyncVaultPayload;
          if (active && created.syncKey) {
            const merged = mergeSyncVaults(vaultRef.current, created);
            merged.syncKey = created.syncKey;
            persistLocalVault(merged, true);
            setSyncStatus("synced");
          }
        } catch {
          // offline fallback; localStorage remains active
        }
        return;
      }

      // Existing syncKey: fetch remote state and merge, or register seamlessly if 404
      try {
        const getRes = await fetch(
          `/api/sync/vault/${encodeURIComponent(current.syncKey)}`,
        );
        if (!active) return;
        if (getRes.ok) {
          const remote = (await getRes.json()) as SyncVaultPayload;
          const merged = mergeSyncVaults(vaultRef.current, remote);
          merged.syncKey = current.syncKey;
          persistLocalVault(merged, true);
          setSyncStatus("synced");
          setSyncMessage("Vault synced on startup");
        } else if (getRes.status === 404) {
          await syncWithServer(vaultRef.current);
        }
      } catch {
        // silent offline fallback
      }
    };

    void bootstrapSync();

    const onOnline = () => {
      if (pendingOnlinePushRef.current && vaultRef.current.syncKey) {
        void syncWithServer(vaultRef.current);
      }
    };
    window.addEventListener("online", onOnline);

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [persistLocalVault, syncWithServer]);

  const scheduleServerSync = useCallback(
    (stamped: SyncVaultPayload) => {
      if (!stamped.preferences.autoSyncEnabled || !stamped.syncKey) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        void syncWithServer(vaultRef.current);
      }, 350);
    },
    [syncWithServer],
  );

  const commitVaultUpdate = useCallback(
    (updater: (prev: SyncVaultPayload) => SyncVaultPayload) => {
      const next = updater(vaultRef.current);
      const stamped: SyncVaultPayload = { ...next, updatedAt: Date.now() };
      persistLocalVault(stamped, true);
      scheduleServerSync(stamped);
    },
    [persistLocalVault, scheduleServerSync],
  );

  const isInLibrary = useCallback(
    (id: number | string, type?: MediaType) => {
      const numId = Number(id);
      if (!numId) return false;
      return vault.library.some((item) => {
        if (item.id !== numId) return false;
        return type ? item.media_type === type : true;
      });
    },
    [vault.library],
  );

  const addToLibrary = useCallback(
    (item: TMDBMediaItem | LibraryEntry, genreMap?: Map<number, string>) => {
      const normalized = normalizeLibraryEntry(item, genreMap);
      if (!normalized.id) return;
      commitVaultUpdate((prev) => {
        const exists = prev.library.some(
          (e) => e.id === normalized.id && e.media_type === normalized.media_type,
        );
        if (exists) return prev;
        return {
          ...prev,
          library: [normalized, ...prev.library],
        };
      });
    },
    [commitVaultUpdate],
  );

  const removeFromLibrary = useCallback(
    (id: number | string, type?: MediaType) => {
      const numId = Number(id);
      if (!numId) return;
      commitVaultUpdate((prev) => ({
        ...prev,
        library: prev.library.filter((item) =>
          type ? !(item.id === numId && item.media_type === type) : item.id !== numId,
        ),
      }));
    },
    [commitVaultUpdate],
  );

  const toggleLibrary = useCallback(
    (item: TMDBMediaItem | LibraryEntry, genreMap?: Map<number, string>) => {
      const mediaType = resolveMediaType(item);
      if (isInLibrary(item.id, mediaType)) {
        removeFromLibrary(item.id, mediaType);
      } else {
        addToLibrary(item, genreMap);
      }
    },
    [addToLibrary, isInLibrary, removeFromLibrary],
  );

  const clearLibrary = useCallback(() => {
    commitVaultUpdate((prev) => ({ ...prev, library: [] }));
  }, [commitVaultUpdate]);

  const recordWatchHistory = useCallback(
    (entry: WatchHistoryEntry) => {
      commitVaultUpdate((prev) => {
        const filtered = prev.history.filter(
          (h) => !(h.id === entry.id && h.media_type === entry.media_type),
        );
        return {
          ...prev,
          history: [entry, ...filtered].slice(0, 40),
        };
      });
    },
    [commitVaultUpdate],
  );

  const removeHistoryItem = useCallback(
    (id: number | string, mediaType: MediaType) => {
      const numId = Number(id);
      commitVaultUpdate((prev) => ({
        ...prev,
        history: prev.history.filter((h) => !(h.id === numId && h.media_type === mediaType)),
      }));
    },
    [commitVaultUpdate],
  );

  const clearHistory = useCallback(() => {
    commitVaultUpdate((prev) => ({ ...prev, history: [] }));
  }, [commitVaultUpdate]);

  const updatePreferences = useCallback(
    (partial: Partial<SyncPreferences>) => {
      commitVaultUpdate((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, ...partial },
      }));
    },
    [commitVaultUpdate],
  );

  const pushSyncNow = useCallback(async () => {
    if (!vaultRef.current.syncKey) {
      setSyncStatus("syncing");
      try {
        const res = await fetch("/api/sync/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vaultRef.current),
        });
        if (!res.ok) throw new Error("Sync server unavailable");
        const created = (await res.json()) as SyncVaultPayload;
        persistLocalVault(created, true);
        setSyncStatus("synced");
        setSyncMessage("Created & synced vault");
        return created;
      } catch {
        setSyncStatus("error");
        setSyncMessage("Saved locally; server sync pending");
        return null;
      }
    }
    return syncWithServer(vaultRef.current);
  }, [persistLocalVault, syncWithServer]);

  const linkSyncKey = useCallback(
    async (rawCode: string): Promise<{ ok: boolean; error?: string }> => {
      const formatted = formatSyncCode(rawCode);
      if (!isValidSyncCode(formatted)) {
        return { ok: false, error: "Enter a valid Sync Key (format: XERO-XXXX-XXXX)." };
      }

      setSyncStatus("syncing");
      try {
        const res = await fetch(`/api/sync/vault/${encodeURIComponent(formatted)}`);
        if (!res.ok) {
          setSyncStatus("error");
          return { ok: false, error: `No vault found for ${formatted}.` };
        }
        const remote = (await res.json()) as SyncVaultPayload;
        const merged = mergeSyncVaults(
          { ...vaultRef.current, syncKey: formatted },
          remote,
        );
        merged.syncKey = formatted;
        await fetch(`/api/sync/vault/${encodeURIComponent(formatted)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        });
        persistLocalVault(merged, true);
        setSyncStatus("synced");
        setSyncMessage(`Linked & merged with ${formatted}`);
        return { ok: true };
      } catch {
        setSyncStatus("error");
        return { ok: false, error: "Could not reach sync server." };
      }
    },
    [persistLocalVault],
  );

  const generateNewSyncKey = useCallback(async (): Promise<string | null> => {
    setSyncStatus("syncing");
    try {
      const res = await fetch("/api/sync/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vaultRef.current, syncKey: "" }),
      });
      if (!res.ok) throw new Error("Failed to generate key");
      const created = (await res.json()) as SyncVaultPayload;
      persistLocalVault(created, true);
      setSyncStatus("synced");
      setSyncMessage(`Generated new Sync Key ${created.syncKey}`);
      return created.syncKey;
    } catch {
      setSyncStatus("error");
      return null;
    }
  }, [persistLocalVault]);

  const refreshCatalogSync = useCallback(async () => {
    clearApiCache();
    let serverTimestamp = Date.now();
    let clearedCount = 0;
    try {
      const res = await fetch("/api/sync/refresh-catalog", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as {
          clearedCount: number;
          lastCatalogSyncAt: number;
        };
        clearedCount = data.clearedCount;
        serverTimestamp = data.lastCatalogSyncAt;
      }
    } catch {
      // ignore if offline
    }

    commitVaultUpdate((prev) => ({
      ...prev,
      lastCatalogSyncAt: serverTimestamp,
    }));
    setCatalogRefreshTick((t) => t + 1);
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: "CATALOG_REFRESH" });
      } catch {
        // ignore channel closed
      }
    }
    return { clearedCount, lastCatalogSyncAt: serverTimestamp };
  }, [commitVaultUpdate]);

  const importVaultJson = useCallback(
    (jsonText: string): { ok: boolean; error?: string } => {
      try {
        const parsed = JSON.parse(jsonText) as Partial<SyncVaultPayload>;
        if (!Array.isArray(parsed.library) && !Array.isArray(parsed.history)) {
          return { ok: false, error: "Invalid XEROTV vault backup format." };
        }
        const incoming: SyncVaultPayload = {
          syncKey: vaultRef.current.syncKey || parsed.syncKey || "",
          deviceId: vaultRef.current.deviceId,
          library: Array.isArray(parsed.library) ? parsed.library : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
          preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) },
          lastCatalogSyncAt: parsed.lastCatalogSyncAt || null,
          updatedAt: Date.now(),
        };
        const merged = mergeSyncVaults(vaultRef.current, incoming);
        persistLocalVault(merged, true);
        if (merged.syncKey) {
          void syncWithServer(merged);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "File is not valid JSON." };
      }
    },
    [persistLocalVault, syncWithServer],
  );

  const exportVaultJson = useCallback(() => {
    return JSON.stringify(vaultRef.current, null, 2);
  }, []);

  return (
    <SyncContext.Provider
      value={{
        vault,
        library: vault.library,
        libraryCount: vault.library.length,
        history: vault.history,
        preferences: vault.preferences,
        runtimeConfig,
        syncStatus,
        syncMessage,
        catalogRefreshTick,
        refreshRuntimeConfig,
        isInLibrary,
        addToLibrary,
        removeFromLibrary,
        toggleLibrary,
        clearLibrary,
        recordWatchHistory,
        removeHistoryItem,
        clearHistory,
        updatePreferences,
        pushSyncNow,
        linkSyncKey,
        generateNewSyncKey,
        refreshCatalogSync,
        importVaultJson,
        exportVaultJson,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used inside SyncProvider");
  }
  return ctx;
}
