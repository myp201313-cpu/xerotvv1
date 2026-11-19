import type {
  AdminConfig,
  LibraryEntry,
  MediaType,
  StreamingServer,
  SyncVaultPayload,
  TMDBMediaItem,
  WatchHistoryEntry,
} from "../types/media";

export const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";
export const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";
export const TMDB_THUMB_BASE = "https://image.tmdb.org/t/p/w92";

/**
 * Only mirrors verified to load cleanly inside `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-presentation">`
 * are included. Hosts that block sandboxed frames (vidlink, vidfast, vidnest, vidyst, vsembed, vidsrcme, 111movies, vidcore, xpass)
 * have been removed.
 */
export const STREAMING_SERVERS: StreamingServer[] = [
  {
    id: "vidzen",
    name: "Server 1 — Vidzen Proxima",
    providerLabel: "Vidzen",
    defaultSandbox: true,
    sandboxVerified: true,
    recommended: true,
    enabled: true,
    qualityHint: "1080p",
  },
  {
    id: "nxsha",
    name: "Server 2 — NXSHA Multi",
    providerLabel: "NXSHA",
    defaultSandbox: true,
    sandboxVerified: true,
    recommended: true,
    enabled: true,
    qualityHint: "1080p",
  },
  {
    id: "vidzee",
    name: "Server 3 — VidZee HLS",
    providerLabel: "VidZee",
    defaultSandbox: true,
    sandboxVerified: true,
    recommended: true,
    enabled: true,
    qualityHint: "1080p",
  },
  {
    id: "nontongo",
    name: "Server 4 — NontonGo Stream",
    providerLabel: "NontonGo",
    defaultSandbox: true,
    sandboxVerified: true,
    recommended: false,
    enabled: true,
    qualityHint: "HD",
  },
  {
    id: "autoembed",
    name: "Server 5 — Autoembed Multi",
    providerLabel: "Autoembed",
    defaultSandbox: true,
    sandboxVerified: true,
    recommended: false,
    enabled: true,
    qualityHint: "1080p",
  },
  {
    id: "2embed",
    name: "Server 6 — 2Embed Mirror",
    providerLabel: "2Embed",
    defaultSandbox: true,
    sandboxVerified: true,
    recommended: false,
    enabled: true,
    qualityHint: "HD",
  },
];

export function createDefaultAdminConfig(): AdminConfig {
  const serverOverrides: AdminConfig["serverOverrides"] = {};
  STREAMING_SERVERS.forEach((srv, idx) => {
    serverOverrides[srv.id] = {
      enabled: srv.enabled !== false,
      recommended: Boolean(srv.recommended),
      order: idx,
    };
  });
  return {
    defaultServerId: STREAMING_SERVERS[0].id,
    enforceSandbox: true,
    downloadsEnabled: true,
    roomsEnabled: true,
    catalogAutoSync: true,
    announcement: "",
    tmdbCacheTtlMinutes: 20,
    serverOverrides,
    updatedAt: Date.now(),
  };
}

export function applyAdminConfigToServers(
  config?: Partial<AdminConfig> | null,
  includeDisabled = false,
): StreamingServer[] {
  const overrides = config?.serverOverrides || {};
  const mapped = STREAMING_SERVERS.map((srv, idx) => {
    const ov = overrides[srv.id];
    return {
      ...srv,
      enabled: ov ? ov.enabled : srv.enabled !== false,
      recommended: ov ? ov.recommended : Boolean(srv.recommended),
      defaultSandbox: config?.enforceSandbox ?? srv.defaultSandbox,
      _order: ov ? ov.order : idx,
    };
  });

  mapped.sort((a, b) => a._order - b._order);

  return mapped
    .filter((s) => includeDisabled || s.enabled)
    .map(({ _order: _ignored, ...rest }) => rest);
}

export function resolveMediaType(item: Partial<TMDBMediaItem>): MediaType {
  if (item.media_type === "tv" || item.type === "tv") return "tv";
  if (item.media_type === "movie" || item.type === "movie") return "movie";
  if (item.first_air_date && !item.release_date) return "tv";
  return "movie";
}

export function getMediaTitle(item: Partial<TMDBMediaItem>): string {
  return item.title || item.name || item.original_title || item.original_name || "Untitled";
}

export function getMediaYear(item: Partial<TMDBMediaItem>): string {
  const dateStr = item.release_date || item.first_air_date || "";
  return dateStr.length >= 4 ? dateStr.slice(0, 4) : "";
}

export function formatRating(voteAverage?: number | null): string {
  if (typeof voteAverage !== "number" || Number.isNaN(voteAverage) || voteAverage <= 0) {
    return "NR";
  }
  return voteAverage.toFixed(1);
}

export function getPosterUrl(posterPath?: string | null, small = false): string | null {
  if (!posterPath) return null;
  return `${small ? TMDB_THUMB_BASE : TMDB_POSTER_BASE}${posterPath}`;
}

export function getBackdropUrl(backdropPath?: string | null): string | null {
  if (!backdropPath) return null;
  return `${TMDB_BACKDROP_BASE}${backdropPath}`;
}

export function extractGenreNames(
  item: TMDBMediaItem | LibraryEntry,
  genreMap?: Map<number, string>,
): string[] {
  if (Array.isArray(item.genres) && item.genres.length > 0) {
    return item.genres
      .map((g) => (typeof g === "string" ? g : g.name))
      .filter((name): name is string => Boolean(name));
  }
  if ("genre_ids" in item && Array.isArray(item.genre_ids) && genreMap) {
    return item.genre_ids
      .map((id) => genreMap.get(id))
      .filter((name): name is string => Boolean(name));
  }
  return [];
}

export function normalizeLibraryEntry(
  item: TMDBMediaItem | LibraryEntry,
  genreMap?: Map<number, string>,
): LibraryEntry {
  const mediaType = resolveMediaType(item);
  const rawGenres = extractGenreNames(item, genreMap);
  const firstAirDate = "first_air_date" in item ? item.first_air_date : undefined;

  return {
    id: Number(item.id),
    media_type: mediaType,
    title: getMediaTitle(item),
    poster_path: item.poster_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    vote_average: typeof item.vote_average === "number" ? item.vote_average : 0,
    release_date: item.release_date || firstAirDate || "",
    overview: item.overview || "",
    genres: rawGenres,
    addedAt: "addedAt" in item && typeof item.addedAt === "number" ? item.addedAt : Date.now(),
  };
}

export function buildStreamUrlForServerId(
  serverId: string,
  mediaType: MediaType,
  id: number | string,
  season = 1,
  episode = 1,
): string {
  const tvSuffix = mediaType === "tv" ? `/${season}/${episode}` : "";

  switch (serverId) {
    case "vidzen":
      return `https://vidzen.fun/${mediaType}/${id}${tvSuffix}`;
    case "nxsha":
      return `https://web.nxsha.app/embed/${mediaType}/${id}${tvSuffix}`;
    case "vidzee":
      return `https://player.vidzee.wtf/embed/${mediaType}/${id}${tvSuffix}`;
    case "nontongo":
      return `https://www.nontongo.win/embed/${mediaType}/${id}${tvSuffix}`;
    case "autoembed":
      return mediaType === "tv"
        ? `https://autoembed.co/tv/tmdb/${id}-${season}-${episode}`
        : `https://autoembed.co/movie/tmdb/${id}`;
    case "2embed":
      return mediaType === "tv"
        ? `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${id}`;
    default:
      return `https://vidzen.fun/${mediaType}/${id}${tvSuffix}`;
  }
}

export function buildStreamUrl(
  serverIndex: number,
  mediaType: MediaType,
  id: number | string,
  season = 1,
  episode = 1,
  serversList: StreamingServer[] = STREAMING_SERVERS,
): string {
  const list = serversList.length > 0 ? serversList : STREAMING_SERVERS;
  const safeIndex = Math.max(0, Math.min(serverIndex, list.length - 1));
  const server = list[safeIndex];
  return buildStreamUrlForServerId(server.id, mediaType, id, season, episode);
}

export type LibraryFilterType = "all" | "movie" | "tv";
export type LibrarySortOrder = "recent" | "rating" | "title";

export function filterAndSortLibrary(
  items: LibraryEntry[],
  options: {
    type?: LibraryFilterType;
    query?: string;
    sort?: LibrarySortOrder;
  } = {},
): LibraryEntry[] {
  const { type = "all", query = "", sort = "recent" } = options;
  const q = query.trim().toLowerCase();

  const filtered = items.filter((item) => {
    if (type !== "all" && item.media_type !== type) return false;
    if (q && !item.title.toLowerCase().includes(q)) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sort === "rating") return (b.vote_average || 0) - (a.vote_average || 0);
    if (sort === "title") return a.title.localeCompare(b.title);
    return (b.addedAt || 0) - (a.addedAt || 0);
  });
}

export function mergeSyncVaults(
  localVault: SyncVaultPayload,
  remoteVault: SyncVaultPayload,
): SyncVaultPayload {
  const libMap = new Map<string, LibraryEntry>();
  for (const entry of remoteVault.library || []) {
    libMap.set(`${entry.media_type}:${entry.id}`, entry);
  }
  for (const entry of localVault.library || []) {
    const key = `${entry.media_type}:${entry.id}`;
    const existing = libMap.get(key);
    if (!existing || entry.addedAt >= existing.addedAt) {
      libMap.set(key, entry);
    }
  }

  const historyMap = new Map<string, WatchHistoryEntry>();
  for (const item of remoteVault.history || []) {
    historyMap.set(`${item.media_type}:${item.id}`, item);
  }
  for (const item of localVault.history || []) {
    const key = `${item.media_type}:${item.id}`;
    const existing = historyMap.get(key);
    if (!existing || item.watchedAt >= existing.watchedAt) {
      historyMap.set(key, item);
    }
  }

  const useLocalPrefs = localVault.updatedAt >= remoteVault.updatedAt;
  const mergedLibrary = Array.from(libMap.values()).sort((a, b) => b.addedAt - a.addedAt);
  const mergedHistory = Array.from(historyMap.values())
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, 40);

  return {
    syncKey: localVault.syncKey || remoteVault.syncKey,
    deviceId: localVault.deviceId || remoteVault.deviceId,
    library: mergedLibrary,
    history: mergedHistory,
    preferences: useLocalPrefs ? localVault.preferences : remoteVault.preferences,
    lastCatalogSyncAt:
      Math.max(localVault.lastCatalogSyncAt || 0, remoteVault.lastCatalogSyncAt || 0) || null,
    updatedAt: Math.max(localVault.updatedAt, remoteVault.updatedAt, Date.now()),
  };
}

export function formatSyncCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("XERO") && cleaned.length >= 12) {
    return `XERO-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
  }
  if (cleaned.length === 8) {
    return `XERO-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  }
  return raw.trim().toUpperCase();
}

export function isValidSyncCode(code: string): boolean {
  return /^XERO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.trim().toUpperCase());
}
