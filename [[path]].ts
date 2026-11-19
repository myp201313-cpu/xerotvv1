import {
  applyAdminConfigToServers,
  buildStreamUrlForServerId,
  createDefaultAdminConfig,
  STREAMING_SERVERS,
} from "../../src/utils/catalogLogic";
import {
  buildSafeDownloadFilename,
  isAllowedDownloadUrl,
  resolveRealMediaDownloads,
} from "../../src/utils/downloadResolver";
import type {
  AdminConfig,
  MediaDownloadResponse,
  MediaType,
  RuntimeConfig,
} from "../../src/types/media";

interface Env {
  TMDB_READ_ACCESS_TOKEN?: string;
  TMDB_API_KEY?: string;
  TMDB_BASE_URL?: string;
  ADMIN_PASS_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  XEROTV_KV?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}

interface PagesContext {
  request: Request;
  env: Env;
}

// Precomputed SHA-256 hex digest for admin authentication (plaintext is never stored in code)
const DEFAULT_ADMIN_PASS_HASH_HEX =
  "5729937300562f18bc0963e467bbcda597f2c391f4a458f5c091f366cba9a099";
const ADMIN_COOKIE_NAME = "xerotv_admin_session";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

interface MirrorHealthItem {
  id: string;
  ok: boolean;
  embeddable: boolean;
  sandboxCompatible: boolean;
  status: number;
  latencyMs: number;
}

const memCache = new Map<string, CacheEntry>();
const downloadCache = new Map<string, { data: MediaDownloadResponse; expiresAt: number }>();
const syncVaults = new Map<string, Record<string, unknown>>();
const syncRooms = new Map<string, Record<string, unknown>>();
const failedLoginMap = new Map<string, { count: number; lockedUntil: number }>();

let adminConfig: AdminConfig = createDefaultAdminConfig();
let cacheHits = 0;
let cacheMisses = 0;
let lastCatalogSyncAt: number | null = null;
let cachedMirrorHealth: { checkedAt: number; servers: MirrorHealthItem[] } | null = null;

function buildWindowsShortcut(appOrigin: string): string {
  const cleanOrigin = appOrigin.replace(/\/+$/, "");
  return `[InternetShortcut]\r\nURL=${cleanOrigin}\r\n`;
}

function buildTwaManifest(appOrigin: string): Record<string, unknown> {
  const cleanOrigin = appOrigin.replace(/\/+$/, "");
  let host = "localhost";
  try {
    host = new URL(cleanOrigin).host;
  } catch {
    host = "localhost";
  }
  return {
    packageId: "tv.xero.app",
    host,
    name: "XEROTV",
    launcherName: "XEROTV",
    display: "standalone",
    themeColor: "#090A0F",
    navigationColor: "#090A0F",
    backgroundColor: "#090A0F",
    startUrl: "/",
    iconUrl: `${cleanOrigin}/pwa-512x512.png`,
    maskableIconUrl: `${cleanOrigin}/pwa-maskable-512x512.png`,
    splashScreenFadeOutDuration: 250,
    signingKey: { alias: "xerotv-release" },
    appVersionName: "1.0.0",
    appVersionCode: 1,
    shortcuts: [],
    generatorApp: "XEROTV-Edge",
    fallbackType: "customtabs",
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    webManifestUrl: `${cleanOrigin}/manifest.webmanifest`,
  };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getEdgeCache(): Cache | null {
  try {
    const cs = caches as unknown as { default?: Cache };
    return cs?.default || null;
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) {
    diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

async function getSessionSecret(env: Env): Promise<string> {
  if (env.ADMIN_SESSION_SECRET) return env.ADMIN_SESSION_SECRET;
  const hashHex = env.ADMIN_PASS_HASH || DEFAULT_ADMIN_PASS_HASH_HEX;
  return sha256Hex(`xerotv-hmac:${hashHex}`);
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(new Uint8Array(sig));
}

async function createAdminSessionToken(env: Env): Promise<string> {
  const exp = Date.now() + ADMIN_SESSION_TTL_MS;
  const rand = new Uint8Array(8);
  globalThis.crypto.getRandomValues(rand);
  const payload = `${exp}.${toHex(rand)}`;
  const secret = await getSessionSecret(env);
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

async function verifyAdminSessionToken(env: Env, token?: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sigHex] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !nonce) return false;
  const secret = await getSessionSecret(env);
  const expectedHex = await hmacHex(secret, `${expStr}.${nonce}`);
  return timingSafeHexEqual(sigHex, expectedHex);
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie") || "";
  const map: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) map[k] = decodeURIComponent(v);
  }
  return map;
}

async function isAuthenticatedAdmin(request: Request, env: Env): Promise<boolean> {
  const cookies = parseCookies(request);
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const token = cookies[ADMIN_COOKIE_NAME] || bearer;
  return verifyAdminSessionToken(env, token);
}

function generateSyncKey(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  const hex = toHex(bytes).toUpperCase();
  return `XERO-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

async function getAdminConfig(env: Env): Promise<AdminConfig> {
  if (env.XEROTV_KV) {
    try {
      const raw = await env.XEROTV_KV.get("admin:config");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AdminConfig>;
        const defaults = createDefaultAdminConfig();
        adminConfig = {
          ...defaults,
          ...parsed,
          serverOverrides: {
            ...defaults.serverOverrides,
            ...(parsed.serverOverrides || {}),
          },
        };
      }
    } catch {
      // keep isolate config
    }
  }
  return adminConfig;
}

async function saveAdminConfig(env: Env, next: AdminConfig): Promise<void> {
  adminConfig = next;
  if (env.XEROTV_KV) {
    try {
      await env.XEROTV_KV.put("admin:config", JSON.stringify(next));
    } catch {
      // ignore KV error
    }
  }
}

async function getVault(env: Env, key: string): Promise<Record<string, unknown> | null> {
  const inMem = syncVaults.get(key);
  if (inMem) return inMem;
  if (env.XEROTV_KV) {
    try {
      const raw = await env.XEROTV_KV.get(`vault:${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        syncVaults.set(key, parsed);
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function putVault(env: Env, key: string, payload: Record<string, unknown>): Promise<void> {
  syncVaults.set(key, payload);
  if (env.XEROTV_KV) {
    try {
      await env.XEROTV_KV.put(`vault:${key}`, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }
}

async function deleteVault(env: Env, key: string): Promise<boolean> {
  const existed = syncVaults.delete(key);
  if (env.XEROTV_KV) {
    try {
      await env.XEROTV_KV.delete(`vault:${key}`);
      return true;
    } catch {
      // ignore
    }
  }
  return existed;
}

function buildRuntimeConfig(cfg: AdminConfig): RuntimeConfig {
  const servers = applyAdminConfigToServers(cfg, false);
  const activeServers = servers.length > 0 ? servers : [STREAMING_SERVERS[0]];
  const defaultExists = activeServers.some((s) => s.id === cfg.defaultServerId);
  return {
    servers: activeServers,
    defaultServerId: defaultExists ? cfg.defaultServerId : activeServers[0].id,
    enforceSandbox: cfg.enforceSandbox,
    downloadsEnabled: cfg.downloadsEnabled,
    roomsEnabled: cfg.roomsEnabled,
    catalogAutoSync: cfg.catalogAutoSync,
    announcement: cfg.announcement || "",
  };
}

async function probeMirrorServer(id: string): Promise<MirrorHealthItem> {
  const probeUrl = buildStreamUrlForServerId(id, "movie", 550);
  const startedAt = Date.now();
  try {
    const upstream = await fetch(probeUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4500),
    });
    const xfo = (upstream.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (upstream.headers.get("content-security-policy") || "").toLowerCase();
    const blockedByXfo =
      (xfo.includes("deny") || xfo.includes("sameorigin")) &&
      !csp.includes("frame-ancestors *");
    const blockedByCsp =
      csp.includes("frame-ancestors 'none'") || csp.includes("frame-ancestors 'self'");
    const embeddable = !blockedByXfo && !blockedByCsp;

    let sandboxCompatible = embeddable;
    if (upstream.url.includes("sandbox.php")) {
      sandboxCompatible = false;
    } else {
      const sampleText = (await upstream.text().catch(() => "")).slice(0, 12000).toLowerCase();
      if (
        sampleText.includes("please disable sandbox") ||
        sampleText.includes("iframe sandbox detected") ||
        sampleText.includes("domain may be for sale")
      ) {
        sandboxCompatible = false;
      }
    }

    const ok = upstream.status >= 200 && upstream.status < 400 && sandboxCompatible;
    return {
      id,
      ok,
      embeddable,
      sandboxCompatible,
      status: upstream.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      id,
      ok: false,
      embeddable: false,
      sandboxCompatible: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const origin = url.origin;

  const cfg = await getAdminConfig(env);

  if (path === "/api/download/XEROTV.url" && method === "GET") {
    return new Response(buildWindowsShortcut(origin), {
      status: 200,
      headers: {
        "Content-Type": "application/internet-shortcut; charset=utf-8",
        "Content-Disposition": 'attachment; filename="XEROTV.url"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (path === "/api/download/twa-manifest.json" && method === "GET") {
    return new Response(JSON.stringify(buildTwaManifest(origin), null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="twa-manifest.json"',
      },
    });
  }

  if (path === "/api/config/runtime" && method === "GET") {
    return json(buildRuntimeConfig(cfg), 200, { "Cache-Control": "no-store" });
  }

  if (path === "/api/servers/health" && method === "GET") {
    const force = url.searchParams.get("fresh") === "1";
    const now = Date.now();
    if (!force && cachedMirrorHealth && now - cachedMirrorHealth.checkedAt < 60_000) {
      return json(cachedMirrorHealth);
    }
    const servers = await Promise.all(
      STREAMING_SERVERS.map((srv) => probeMirrorServer(srv.id)),
    );
    cachedMirrorHealth = { checkedAt: Date.now(), servers };
    return json(cachedMirrorHealth);
  }

  if (path === "/api/media/downloads" && method === "GET") {
    const mediaType: MediaType = url.searchParams.get("type") === "tv" ? "tv" : "movie";
    const tmdbId = (url.searchParams.get("id") || "").trim();
    if (!cfg.downloadsEnabled) {
      return json({
        mediaType,
        tmdbId,
        downloads: [],
        subtitles: [],
        disabled: true,
        checkedAt: Date.now(),
      });
    }
    const imdbId = (url.searchParams.get("imdb") || "").trim();
    const season = Math.max(1, Number(url.searchParams.get("season")) || 1);
    const episode = Math.max(1, Number(url.searchParams.get("episode")) || 1);
    const force = url.searchParams.get("fresh") === "1";

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return json({ error: "Valid numeric TMDB id is required." }, 400);
    }

    const cacheKey = `${mediaType}:${tmdbId}:${season}:${episode}:${imdbId}`;
    const now = Date.now();
    if (!force && downloadCache.has(cacheKey)) {
      const entry = downloadCache.get(cacheKey)!;
      if (entry.expiresAt > now) {
        return json(entry.data);
      }
      downloadCache.delete(cacheKey);
    }

    try {
      const resolved = await resolveRealMediaDownloads({
        mediaType,
        tmdbId,
        imdbId,
        season,
        episode,
      });
      downloadCache.set(cacheKey, { data: resolved, expiresAt: Date.now() + 600_000 });
      return json(resolved);
    } catch (err) {
      return json(
        {
          mediaType,
          tmdbId,
          downloads: [],
          subtitles: [],
          checkedAt: Date.now(),
          error: err instanceof Error ? err.message : "Download lookup failed",
        },
        502,
      );
    }
  }

  if (path === "/api/media/download-file" && method === "GET") {
    if (!cfg.downloadsEnabled) {
      return json({ error: "Downloads are disabled by administrator." }, 403);
    }
    const rawUrl = url.searchParams.get("url") || "";
    if (!isAllowedDownloadUrl(rawUrl)) {
      return json({ error: "Download source URL is not from an allowed CDN host." }, 400);
    }
    const title = url.searchParams.get("title") || "XEROTV-Media";
    const mediaType: MediaType = url.searchParams.get("type") === "tv" ? "tv" : "movie";
    const quality = url.searchParams.get("quality") || "HD";
    const ext = url.searchParams.get("ext") || "mp4";
    const season = Number(url.searchParams.get("season")) || undefined;
    const episode = Number(url.searchParams.get("episode")) || undefined;
    const filename = buildSafeDownloadFilename(title, mediaType, quality, ext, season, episode);

    try {
      const reqHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
      };
      const range = request.headers.get("range");
      if (range) reqHeaders.Range = range;

      const upstream = await fetch(rawUrl, {
        headers: reqHeaders,
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        return json({ error: `Upstream returned ${upstream.status}` }, upstream.status);
      }

      const headers = new Headers();
      headers.set(
        "Content-Type",
        upstream.headers.get("content-type") || "application/octet-stream",
      );
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
      const cl = upstream.headers.get("content-length");
      const cr = upstream.headers.get("content-range");
      const ar = upstream.headers.get("accept-ranges");
      if (cl) headers.set("Content-Length", cl);
      if (cr) headers.set("Content-Range", cr);
      if (ar) headers.set("Accept-Ranges", ar);

      return new Response(upstream.body, {
        status: upstream.status,
        headers,
      });
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "Failed to stream download" },
        502,
      );
    }
  }

  if (path === "/api/sync/status" && method === "GET") {
    return json({
      service: "XEROTV",
      tmdbConfigured: Boolean(env.TMDB_READ_ACCESS_TOKEN || env.TMDB_API_KEY),
      cacheEntries: memCache.size,
      cacheHits,
      cacheMisses,
      activeVaults: syncVaults.size,
      activeRooms: syncRooms.size,
      lastCatalogSyncAt,
      serverTime: Date.now(),
    });
  }

  if (path === "/api/sync/refresh-catalog" && method === "POST") {
    const clearedCount = memCache.size;
    memCache.clear();
    lastCatalogSyncAt = Date.now();
    return json({ success: true, clearedCount, lastCatalogSyncAt });
  }

  if (path === "/api/sync/vault" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    let syncKey = generateSyncKey();
    while (await getVault(env, syncKey)) {
      syncKey = generateSyncKey();
    }
    const payload = { ...body, syncKey, updatedAt: Date.now() };
    await putVault(env, syncKey, payload);
    return json(payload, 201);
  }

  if (path.startsWith("/api/sync/vault/")) {
    const key = decodeURIComponent(path.replace("/api/sync/vault/", "")).trim().toUpperCase();
    if (method === "GET") {
      const vault = await getVault(env, key);
      if (!vault) return json({ error: "Sync vault not found", syncKey: key }, 404);
      return json(vault);
    }
    if (method === "PUT") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const existing = (await getVault(env, key)) || {};
      const merged = { ...existing, ...body, syncKey: key, updatedAt: Date.now() };
      await putVault(env, key, merged);
      return json(merged);
    }
  }

  if (path.startsWith("/api/rooms/")) {
    if (!cfg.roomsEnabled) {
      return json({ error: "Watch Sync Rooms are currently disabled." }, 403);
    }
    const code = decodeURIComponent(path.replace("/api/rooms/", "")).trim().toUpperCase();
    if (method === "GET") {
      const room = syncRooms.get(code);
      if (!room) return json({ error: "Sync room not found", roomCode: code }, 404);
      return json(room);
    }
    if (method === "PUT") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const payload = { ...body, roomCode: code, updatedAt: Date.now() };
      syncRooms.set(code, payload);
      return json(payload);
    }
  }

  // ==================== ADMIN CONTROL ROUTES (PASSCODE NEVER EXPOSED) ====================
  if (path === "/api/admin/login" && method === "POST") {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const now = Date.now();
    const tracker = failedLoginMap.get(ip);
    if (tracker && tracker.lockedUntil > now) {
      return json({ error: "Too many failed attempts. Please wait before retrying." }, 429);
    }

    const body = (await request.json().catch(() => ({}))) as { passcode?: string };
    const passcode = typeof body?.passcode === "string" ? body.passcode : "";
    const candidateHex = await sha256Hex(passcode);
    const targetHex = env.ADMIN_PASS_HASH || DEFAULT_ADMIN_PASS_HASH_HEX;

    if (!passcode || !timingSafeHexEqual(candidateHex, targetHex)) {
      const nextCount = (tracker?.count || 0) + 1;
      failedLoginMap.set(ip, {
        count: nextCount,
        lockedUntil: nextCount >= 8 ? now + 300_000 : 0,
      });
      return json({ error: "Invalid credentials" }, 401);
    }

    failedLoginMap.delete(ip);
    const token = await createAdminSessionToken(env);
    const secureFlag = url.protocol === "https:" ? "; Secure" : "";
    return json(
      { authenticated: true },
      200,
      {
        "Set-Cookie": `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}${secureFlag}`,
      },
    );
  }

  if (path === "/api/admin/logout" && method === "POST") {
    return json(
      { authenticated: false },
      200,
      {
        "Set-Cookie": `${ADMIN_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
      },
    );
  }

  if (path === "/api/admin/session" && method === "GET") {
    const authenticated = await isAuthenticatedAdmin(request, env);
    return json({ authenticated }, 200, { "Cache-Control": "no-store" });
  }

  if (path.startsWith("/api/admin/")) {
    if (!(await isAuthenticatedAdmin(request, env))) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (path === "/api/admin/overview" && method === "GET") {
      const vaults = Array.from(syncVaults.entries())
        .map(([key, v]) => ({
          syncKey: key,
          libraryCount: Array.isArray(v.library) ? v.library.length : 0,
          historyCount: Array.isArray(v.history) ? v.history.length : 0,
          updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
          deviceId: typeof v.deviceId === "string" ? v.deviceId : "unknown",
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const rooms = Array.from(syncRooms.entries())
        .map(([code, r]) => ({
          roomCode: code,
          title: typeof r.title === "string" ? r.title : "Untitled",
          mediaType: r.mediaType === "tv" ? "tv" : "movie",
          mediaId: Number(r.mediaId) || 0,
          serverIndex: Number(r.serverIndex) || 0,
          updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);

      return json({
        config: cfg,
        servers: applyAdminConfigToServers(cfg, true),
        mirrorHealth: cachedMirrorHealth,
        stats: {
          tmdbConfigured: Boolean(env.TMDB_READ_ACCESS_TOKEN || env.TMDB_API_KEY),
          tmdbCacheEntries: memCache.size,
          downloadCacheEntries: downloadCache.size,
          cacheHits,
          cacheMisses,
          activeVaults: syncVaults.size,
          activeRooms: syncRooms.size,
          lastCatalogSyncAt,
        },
        vaults,
        rooms,
      });
    }

    if (path === "/api/admin/config" && method === "PUT") {
      const incoming = (await request.json().catch(() => null)) as Partial<AdminConfig> | null;
      if (!incoming || typeof incoming !== "object") {
        return json({ error: "Invalid configuration payload" }, 400);
      }
      const nextOverrides = { ...cfg.serverOverrides };
      if (incoming.serverOverrides && typeof incoming.serverOverrides === "object") {
        for (const srv of STREAMING_SERVERS) {
          const patch = incoming.serverOverrides[srv.id];
          if (patch && typeof patch === "object") {
            nextOverrides[srv.id] = {
              enabled: Boolean(patch.enabled),
              recommended: Boolean(patch.recommended),
              order: Number.isFinite(Number(patch.order))
                ? Number(patch.order)
                : nextOverrides[srv.id]?.order ?? 0,
            };
          }
        }
      }
      const updated: AdminConfig = {
        ...cfg,
        defaultServerId:
          typeof incoming.defaultServerId === "string" &&
          STREAMING_SERVERS.some((s) => s.id === incoming.defaultServerId)
            ? incoming.defaultServerId
            : cfg.defaultServerId,
        enforceSandbox:
          typeof incoming.enforceSandbox === "boolean"
            ? incoming.enforceSandbox
            : cfg.enforceSandbox,
        downloadsEnabled:
          typeof incoming.downloadsEnabled === "boolean"
            ? incoming.downloadsEnabled
            : cfg.downloadsEnabled,
        roomsEnabled:
          typeof incoming.roomsEnabled === "boolean" ? incoming.roomsEnabled : cfg.roomsEnabled,
        catalogAutoSync:
          typeof incoming.catalogAutoSync === "boolean"
            ? incoming.catalogAutoSync
            : cfg.catalogAutoSync,
        announcement:
          typeof incoming.announcement === "string"
            ? incoming.announcement.slice(0, 240)
            : cfg.announcement,
        tmdbCacheTtlMinutes: Number.isFinite(Number(incoming.tmdbCacheTtlMinutes))
          ? Math.max(1, Math.min(240, Number(incoming.tmdbCacheTtlMinutes)))
          : cfg.tmdbCacheTtlMinutes,
        serverOverrides: nextOverrides,
        updatedAt: Date.now(),
      };
      await saveAdminConfig(env, updated);
      return json({ config: updated, runtime: buildRuntimeConfig(updated) });
    }

    if (path === "/api/admin/cache/clear" && method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { scope?: string };
      const scope = String(body?.scope || "all");
      let clearedTmdb = 0;
      let clearedDownloads = 0;
      let clearedHealth = false;

      if (scope === "all" || scope === "tmdb") {
        clearedTmdb = memCache.size;
        memCache.clear();
        lastCatalogSyncAt = Date.now();
      }
      if (scope === "all" || scope === "downloads") {
        clearedDownloads = downloadCache.size;
        downloadCache.clear();
      }
      if (scope === "all" || scope === "health") {
        cachedMirrorHealth = null;
        clearedHealth = true;
      }
      return json({
        success: true,
        clearedTmdb,
        clearedDownloads,
        clearedHealth,
        lastCatalogSyncAt,
      });
    }

    if (path.startsWith("/api/admin/vaults/") && method === "DELETE") {
      const key = decodeURIComponent(path.replace("/api/admin/vaults/", ""))
        .trim()
        .toUpperCase();
      const deleted = await deleteVault(env, key);
      return json({ deleted, syncKey: key });
    }

    if (path.startsWith("/api/admin/rooms/") && method === "DELETE") {
      const code = decodeURIComponent(path.replace("/api/admin/rooms/", ""))
        .trim()
        .toUpperCase();
      const deleted = syncRooms.delete(code);
      return json({ deleted, roomCode: code });
    }

    return json({ error: "Not found" }, 404);
  }

  // ==================== TMDB EDGE PROXY (/api/*) ====================
  if (method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const token = env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = env.TMDB_API_KEY;
  if (!token && !apiKey) {
    return json(
      { success: false, status_message: "TMDB credentials are not configured on Cloudflare Pages." },
      503,
    );
  }

  const tmdbSubPath = path.replace(/^\/api/, "");
  const bypassCache = url.searchParams.get("_fresh") === "1";
  const cacheKeyStr = `${tmdbSubPath}${url.search}`;
  const edgeCache = getEdgeCache();
  const edgeCacheRequest = new Request(url.toString(), { method: "GET" });

  if (!bypassCache && edgeCache) {
    const edgeHit = await edgeCache.match(edgeCacheRequest);
    if (edgeHit) {
      cacheHits += 1;
      const headers = new Headers(edgeHit.headers);
      headers.set("X-Cache-Status", "HIT");
      return new Response(edgeHit.body, { status: edgeHit.status, headers });
    }
  }

  const now = Date.now();
  if (!bypassCache && memCache.has(cacheKeyStr)) {
    const entry = memCache.get(cacheKeyStr)!;
    if (entry.expiresAt > now) {
      cacheHits += 1;
      return json(entry.data, 200, {
        "X-Cache-Status": "HIT",
        "Cache-Control": "public, max-age=1200",
      });
    }
    memCache.delete(cacheKeyStr);
  }

  cacheMisses += 1;

  try {
    const base = (env.TMDB_BASE_URL || "https://api.themoviedb.org/3")
      .replace(/\/4\/?$/, "/3")
      .replace(/\/+$/, "");
    const upstreamUrl = new URL(`${base}${tmdbSubPath}${url.search}`);
    upstreamUrl.searchParams.delete("_fresh");
    if (!token && apiKey) {
      upstreamUrl.searchParams.set("api_key", apiKey);
    }

    const reqHeaders: Record<string, string> = { Accept: "application/json" };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;

    const upstreamRes = await fetch(upstreamUrl.toString(), {
      headers: reqHeaders,
      signal: AbortSignal.timeout(12000),
    });
    const rawBody = await upstreamRes.text();
    let data: unknown;
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = { success: false, status_message: "Invalid response from TMDB upstream" };
    }

    if (!upstreamRes.ok) {
      return json(data, upstreamRes.status);
    }

    const ttlSecs = Math.max(60, Math.min(14400, (Number(cfg.tmdbCacheTtlMinutes) || 20) * 60));
    memCache.set(cacheKeyStr, { data, expiresAt: now + ttlSecs * 1000 });
    if (!lastCatalogSyncAt) lastCatalogSyncAt = now;

    const response = json(data, 200, {
      "X-Cache-Status": "MISS",
      "Cache-Control": `public, max-age=${ttlSecs}`,
    });
    if (edgeCache) {
      await edgeCache.put(edgeCacheRequest, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    return json(
      {
        success: false,
        status_message: `Failed to reach TMDB upstream: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      502,
    );
  }
}
