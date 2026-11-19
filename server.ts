import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { buildTwaManifest, buildWindowsShortcut } from "./src/utils/zipBuilder.ts";
import { buildSignedXeroTvApk } from "./src/utils/apkBuilder.ts";
import {
  applyAdminConfigToServers,
  buildStreamUrlForServerId,
  createDefaultAdminConfig,
  STREAMING_SERVERS,
} from "./src/utils/catalogLogic.ts";
import {
  buildSafeDownloadFilename,
  isAllowedDownloadUrl,
  resolveRealMediaDownloads,
} from "./src/utils/downloadResolver.ts";
import type {
  AdminConfig,
  MediaDownloadResponse,
  MediaType,
  RuntimeConfig,
} from "./src/types/media.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const rawTmdbBase = process.env.TMDB_BASE_URL || "https://api.themoviedb.org/3";
const TMDB_BASE_URL = rawTmdbBase.replace(/\/4\/?$/, "/3").replace(/\/+$/, "");
const DATA_DIR = path.resolve(__dirname, ".xerotv-data");
const VAULTS_FILE = path.join(DATA_DIR, "vaults.json");
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, "admin-config.json");

// Precomputed SHA-256 hex digest for admin authentication (plaintext is never stored in code)
const ADMIN_PASS_HASH_HEX =
  process.env.ADMIN_PASS_HASH ||
  "5729937300562f18bc0963e467bbcda597f2c391f4a458f5c091f366cba9a099";
const ADMIN_COOKIE_NAME = "xerotv_admin_session";
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash("sha256").update(`xerotv-hmac:${ADMIN_PASS_HASH_HEX}`).digest("hex");
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
  cachedAt: number;
}

const serverCache = new Map<string, CacheEntry>();
const downloadCache = new Map<string, { data: MediaDownloadResponse; expiresAt: number }>();
let cacheHits = 0;
let cacheMisses = 0;
let lastCatalogSyncAt: number | null = null;

// In-memory sync vaults + watch party rooms backed by JSON persistence
const syncVaults = new Map<string, Record<string, unknown>>();
const syncRooms = new Map<string, Record<string, unknown>>();
const failedLoginMap = new Map<string, { count: number; lockedUntil: number }>();

let adminConfig: AdminConfig = createDefaultAdminConfig();

function loadPersistedState(): void {
  try {
    if (fs.existsSync(VAULTS_FILE)) {
      const raw = fs.readFileSync(VAULTS_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      for (const [key, val] of Object.entries(parsed)) {
        syncVaults.set(key, val);
      }
    }
  } catch (err) {
    console.warn("Could not read sync vaults file, starting with memory store:", err);
  }

  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const raw = fs.readFileSync(ADMIN_CONFIG_FILE, "utf-8");
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
  } catch (err) {
    console.warn("Could not read admin config file, using defaults:", err);
  }
}

function saveVaultsToDisk(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = Object.fromEntries(syncVaults.entries());
    fs.writeFileSync(VAULTS_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist sync vaults to disk:", err);
  }
}

function saveAdminConfigToDisk(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(adminConfig, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist admin config to disk:", err);
  }
}

function generateSyncKey(): string {
  const bytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `XERO-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
}

function getCacheTtlMs(tmdbPath: string): number {
  if (tmdbPath.includes("/configuration") || tmdbPath.includes("/genre/")) {
    return 24 * 60 * 60 * 1000;
  }
  if (tmdbPath.includes("/search/")) {
    return 5 * 60 * 1000;
  }
  if (
    tmdbPath.includes("/credits") ||
    tmdbPath.includes("/recommendations") ||
    tmdbPath.includes("/videos") ||
    tmdbPath.includes("/season/")
  ) {
    return 60 * 60 * 1000;
  }
  const mins = Math.max(1, Math.min(240, Number(adminConfig.tmdbCacheTtlMinutes) || 20));
  return mins * 60 * 1000;
}

loadPersistedState();

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie || "";
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

function createAdminSessionToken(): string {
  const exp = Date.now() + ADMIN_SESSION_TTL_MS;
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${exp}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

function verifyAdminSessionToken(token?: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sigHex] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !nonce) return false;
  const expectedHex = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(`${expStr}.${nonce}`)
    .digest("hex");
  try {
    const a = Buffer.from(sigHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyAdminPasscode(input: string): boolean {
  const candidateHex = crypto
    .createHash("sha256")
    .update(String(input || ""))
    .digest("hex");
  try {
    const a = Buffer.from(candidateHex, "hex");
    const b = Buffer.from(ADMIN_PASS_HASH_HEX, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const cookies = parseCookies(req);
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const token = cookies[ADMIN_COOKIE_NAME] || bearer;
  if (!verifyAdminSessionToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function buildRuntimeConfig(): RuntimeConfig {
  const servers = applyAdminConfigToServers(adminConfig, false);
  const activeServers = servers.length > 0 ? servers : [STREAMING_SERVERS[0]];
  const defaultExists = activeServers.some((s) => s.id === adminConfig.defaultServerId);
  return {
    servers: activeServers,
    defaultServerId: defaultExists ? adminConfig.defaultServerId : activeServers[0].id,
    enforceSandbox: adminConfig.enforceSandbox,
    downloadsEnabled: adminConfig.downloadsEnabled,
    roomsEnabled: adminConfig.roomsEnabled,
    catalogAutoSync: adminConfig.catalogAutoSync,
    announcement: adminConfig.announcement || "",
  };
}

function resolveRequestOrigin(req: express.Request): string {
  const fwdProto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim();
  const fwdHost = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim();
  const rawHost = fwdHost || req.get("host") || "";
  const isLocalHost =
    !rawHost ||
    rawHost.startsWith("localhost") ||
    rawHost.startsWith("127.0.0.1") ||
    rawHost.startsWith("0.0.0.0");

  if (!isLocalHost) {
    const proto = rawHost.endsWith(".run.app") ? "https" : fwdProto || req.protocol || "https";
    return `${proto}://${rawHost}`.replace(/\/+$/, "");
  }

  const envUrl = process.env.APP_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes("MY_APP_URL")) {
    return envUrl.replace(/\/+$/, "");
  }

  const proto = fwdProto || req.protocol || "http";
  const host = rawHost || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

interface MirrorHealthItem {
  id: string;
  ok: boolean;
  embeddable: boolean;
  sandboxCompatible: boolean;
  status: number;
  latencyMs: number;
}

let cachedMirrorHealth: { checkedAt: number; servers: MirrorHealthItem[] } | null = null;
const MIRROR_HEALTH_TTL_MS = 60 * 1000;

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const sendXeroTvApk = (req: express.Request, res: express.Response) => {
    try {
      const origin = resolveRequestOrigin(req);
      const result = buildSignedXeroTvApk({
        appOrigin: origin,
        dataDir: DATA_DIR,
        publicDir: path.resolve(__dirname, "public"),
      });
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", 'attachment; filename="XEROTV.apk"');
      res.setHeader("Content-Length", String(result.sizeBytes));
      res.setHeader("Cache-Control", "no-store");
      res.send(result.apkBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to package Android APK";
      console.error("APK generation error:", err);
      res.status(500).json({ error: message });
    }
  };

  const sendWindowsShortcut = (req: express.Request, res: express.Response) => {
    const origin = resolveRequestOrigin(req);
    const shortcutBody = buildWindowsShortcut(origin);
    res.setHeader("Content-Type", "application/internet-shortcut; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="XEROTV.url"');
    res.setHeader("Cache-Control", "no-store");
    res.send(shortcutBody);
  };

  // Direct Signed Android APK Download
  app.get("/XEROTV.apk", sendXeroTvApk);
  app.get("/api/download/XEROTV.apk", sendXeroTvApk);

  // Direct Windows Desktop Shortcut (.url)
  app.get("/XEROTV.url", sendWindowsShortcut);
  app.get("/api/download/XEROTV.url", sendWindowsShortcut);

  // Public runtime playback/sync configuration (sanitized)
  app.get("/api/config/runtime", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(buildRuntimeConfig());
  });

  // Streaming Mirror Reachability & Sandbox Check (cached 60s)
  app.get("/api/servers/health", async (req, res) => {
    const force = req.query.fresh === "1";
    const now = Date.now();
    if (!force && cachedMirrorHealth && now - cachedMirrorHealth.checkedAt < MIRROR_HEALTH_TTL_MS) {
      res.json(cachedMirrorHealth);
      return;
    }
    const servers = await Promise.all(
      STREAMING_SERVERS.map((srv) => probeMirrorServer(srv.id)),
    );
    cachedMirrorHealth = { checkedAt: Date.now(), servers };
    res.json(cachedMirrorHealth);
  });

  // Real Movie / TV Episode Download & Subtitle Resolver (no fake links)
  app.get("/api/media/downloads", async (req, res) => {
    if (!adminConfig.downloadsEnabled) {
      res.json({
        mediaType: req.query.type === "tv" ? "tv" : "movie",
        tmdbId: String(req.query.id || ""),
        downloads: [],
        subtitles: [],
        disabled: true,
        checkedAt: Date.now(),
      });
      return;
    }

    const mediaType: MediaType = req.query.type === "tv" ? "tv" : "movie";
    const tmdbId = String(req.query.id || "").trim();
    const imdbId = String(req.query.imdb || "").trim();
    const season = Math.max(1, Number(req.query.season) || 1);
    const episode = Math.max(1, Number(req.query.episode) || 1);
    const force = req.query.fresh === "1";

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      res.status(400).json({ error: "Valid numeric TMDB id is required." });
      return;
    }

    const cacheKey = `${mediaType}:${tmdbId}:${season}:${episode}:${imdbId}`;
    const now = Date.now();
    if (!force && downloadCache.has(cacheKey)) {
      const entry = downloadCache.get(cacheKey)!;
      if (entry.expiresAt > now) {
        res.json(entry.data);
        return;
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
      downloadCache.set(cacheKey, {
        data: resolved,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      res.json(resolved);
    } catch (err) {
      res.status(502).json({
        mediaType,
        tmdbId,
        downloads: [],
        subtitles: [],
        checkedAt: Date.now(),
        error: err instanceof Error ? err.message : "Download lookup failed",
      });
    }
  });

  // Proxied Real File Download with Content-Disposition attachment header (SSRF-allowlisted)
  app.get("/api/media/download-file", async (req, res) => {
    if (!adminConfig.downloadsEnabled) {
      res.status(403).json({ error: "Downloads are disabled by administrator." });
      return;
    }

    const rawUrl = String(req.query.url || "");
    const title = String(req.query.title || "XEROTV-Media");
    const mediaType: MediaType = req.query.type === "tv" ? "tv" : "movie";
    const quality = String(req.query.quality || "HD");
    const ext = String(req.query.ext || "mp4");
    const season = Number(req.query.season) || undefined;
    const episode = Number(req.query.episode) || undefined;

    if (!isAllowedDownloadUrl(rawUrl)) {
      res.status(400).json({ error: "Download source URL is not from an allowed CDN host." });
      return;
    }

    const filename = buildSafeDownloadFilename(title, mediaType, quality, ext, season, episode);

    try {
      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
      };
      if (req.headers.range) {
        headers.Range = req.headers.range;
      }

      const upstream = await fetch(rawUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
        return;
      }

      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges");

      res.status(upstream.status);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import("node:stream/web").ReadableStream,
      );
      nodeStream.on("error", () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          error: err instanceof Error ? err.message : "Failed to stream download",
        });
      }
    }
  });

  // TWA Manifest JSON Download
  app.get("/api/download/twa-manifest.json", (req, res) => {
    const origin = resolveRequestOrigin(req);
    const manifest = buildTwaManifest(origin);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="twa-manifest.json"');
    res.send(JSON.stringify(manifest, null, 2));
  });

  // Health & Sync Status endpoint
  app.get("/api/sync/status", (_req, res) => {
    res.json({
      service: "XEROTV",
      tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY),
      cacheEntries: serverCache.size,
      cacheHits,
      cacheMisses,
      activeVaults: syncVaults.size,
      activeRooms: syncRooms.size,
      lastCatalogSyncAt,
      serverTime: Date.now(),
    });
  });

  // Invalidate server-side TMDB cache to force a fresh catalog sync
  app.post("/api/sync/refresh-catalog", (_req, res) => {
    const clearedCount = serverCache.size;
    serverCache.clear();
    lastCatalogSyncAt = Date.now();
    res.json({
      success: true,
      clearedCount,
      lastCatalogSyncAt,
    });
  });

  // Create a new Sync Vault key
  app.post("/api/sync/vault", (req, res) => {
    let syncKey = generateSyncKey();
    while (syncVaults.has(syncKey)) {
      syncKey = generateSyncKey();
    }
    const payload = {
      ...(req.body || {}),
      syncKey,
      updatedAt: Date.now(),
    };
    syncVaults.set(syncKey, payload);
    saveVaultsToDisk();
    res.status(201).json(payload);
  });

  // Retrieve a Sync Vault by key
  app.get("/api/sync/vault/:syncKey", (req, res) => {
    const key = req.params.syncKey.trim().toUpperCase();
    const vault = syncVaults.get(key);
    if (!vault) {
      res.status(404).json({ error: "Sync vault not found", syncKey: key });
      return;
    }
    res.json(vault);
  });

  // Upsert / push Sync Vault state
  app.put("/api/sync/vault/:syncKey", (req, res) => {
    const key = req.params.syncKey.trim().toUpperCase();
    const existing = syncVaults.get(key) || {};
    const merged = {
      ...existing,
      ...(req.body || {}),
      syncKey: key,
      updatedAt: Date.now(),
    };
    syncVaults.set(key, merged);
    saveVaultsToDisk();
    res.json(merged);
  });

  // Watch Party / Sync Room GET
  app.get("/api/rooms/:roomCode", (req, res) => {
    if (!adminConfig.roomsEnabled) {
      res.status(403).json({ error: "Watch Sync Rooms are currently disabled." });
      return;
    }
    const code = req.params.roomCode.trim().toUpperCase();
    const room = syncRooms.get(code);
    if (!room) {
      res.status(404).json({ error: "Sync room not found", roomCode: code });
      return;
    }
    res.json(room);
  });

  // Watch Party / Sync Room PUT
  app.put("/api/rooms/:roomCode", (req, res) => {
    if (!adminConfig.roomsEnabled) {
      res.status(403).json({ error: "Watch Sync Rooms are currently disabled." });
      return;
    }
    const code = req.params.roomCode.trim().toUpperCase();
    const payload = {
      ...(req.body || {}),
      roomCode: code,
      updatedAt: Date.now(),
    };
    syncRooms.set(code, payload);
    res.json(payload);
  });

  // ==================== ADMIN CONTROL ROUTES (PASSCODE NEVER EXPOSED) ====================
  app.post("/api/admin/login", (req, res) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const tracker = failedLoginMap.get(ip);
    if (tracker && tracker.lockedUntil > now) {
      res.status(429).json({ error: "Too many failed attempts. Please wait before retrying." });
      return;
    }

    const passcode = typeof req.body?.passcode === "string" ? req.body.passcode : "";
    if (!passcode || !verifyAdminPasscode(passcode)) {
      const nextCount = (tracker?.count || 0) + 1;
      failedLoginMap.set(ip, {
        count: nextCount,
        lockedUntil: nextCount >= 8 ? now + 5 * 60 * 1000 : 0,
      });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    failedLoginMap.delete(ip);
    const token = createAdminSessionToken();
    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS,
    });
    res.json({ authenticated: true });
  });

  app.post("/api/admin/logout", (_req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
    res.json({ authenticated: false });
  });

  app.get("/api/admin/session", (req, res) => {
    const cookies = parseCookies(req);
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
    const authenticated = verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME] || bearer);
    res.setHeader("Cache-Control", "no-store");
    res.json({ authenticated });
  });

  app.get("/api/admin/overview", requireAdmin, (_req, res) => {
    const vaults = Array.from(syncVaults.entries()).map(([key, v]) => ({
      syncKey: key,
      libraryCount: Array.isArray(v.library) ? v.library.length : 0,
      historyCount: Array.isArray(v.history) ? v.history.length : 0,
      updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
      deviceId: typeof v.deviceId === "string" ? v.deviceId : "unknown",
    }));
    vaults.sort((a, b) => b.updatedAt - a.updatedAt);

    const rooms = Array.from(syncRooms.entries()).map(([code, r]) => ({
      roomCode: code,
      title: typeof r.title === "string" ? r.title : "Untitled",
      mediaType: r.mediaType === "tv" ? "tv" : "movie",
      mediaId: Number(r.mediaId) || 0,
      serverIndex: Number(r.serverIndex) || 0,
      updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    }));
    rooms.sort((a, b) => b.updatedAt - a.updatedAt);

    res.json({
      config: adminConfig,
      servers: applyAdminConfigToServers(adminConfig, true),
      mirrorHealth: cachedMirrorHealth,
      stats: {
        tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY),
        tmdbCacheEntries: serverCache.size,
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
  });

  app.put("/api/admin/config", requireAdmin, (req, res) => {
    const incoming = req.body as Partial<AdminConfig> | undefined;
    if (!incoming || typeof incoming !== "object") {
      res.status(400).json({ error: "Invalid configuration payload" });
      return;
    }

    const nextOverrides = { ...adminConfig.serverOverrides };
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

    adminConfig = {
      ...adminConfig,
      defaultServerId:
        typeof incoming.defaultServerId === "string" &&
        STREAMING_SERVERS.some((s) => s.id === incoming.defaultServerId)
          ? incoming.defaultServerId
          : adminConfig.defaultServerId,
      enforceSandbox:
        typeof incoming.enforceSandbox === "boolean"
          ? incoming.enforceSandbox
          : adminConfig.enforceSandbox,
      downloadsEnabled:
        typeof incoming.downloadsEnabled === "boolean"
          ? incoming.downloadsEnabled
          : adminConfig.downloadsEnabled,
      roomsEnabled:
        typeof incoming.roomsEnabled === "boolean"
          ? incoming.roomsEnabled
          : adminConfig.roomsEnabled,
      catalogAutoSync:
        typeof incoming.catalogAutoSync === "boolean"
          ? incoming.catalogAutoSync
          : adminConfig.catalogAutoSync,
      announcement:
        typeof incoming.announcement === "string"
          ? incoming.announcement.slice(0, 240)
          : adminConfig.announcement,
      tmdbCacheTtlMinutes: Number.isFinite(Number(incoming.tmdbCacheTtlMinutes))
        ? Math.max(1, Math.min(240, Number(incoming.tmdbCacheTtlMinutes)))
        : adminConfig.tmdbCacheTtlMinutes,
      serverOverrides: nextOverrides,
      updatedAt: Date.now(),
    };
    saveAdminConfigToDisk();
    res.json({ config: adminConfig, runtime: buildRuntimeConfig() });
  });

  app.post("/api/admin/cache/clear", requireAdmin, (req, res) => {
    const scope = String(req.body?.scope || "all");
    let clearedTmdb = 0;
    let clearedDownloads = 0;
    let clearedHealth = false;

    if (scope === "all" || scope === "tmdb") {
      clearedTmdb = serverCache.size;
      serverCache.clear();
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

    res.json({
      success: true,
      clearedTmdb,
      clearedDownloads,
      clearedHealth,
      lastCatalogSyncAt,
    });
  });

  app.delete("/api/admin/vaults/:syncKey", requireAdmin, (req, res) => {
    const key = req.params.syncKey.trim().toUpperCase();
    const deleted = syncVaults.delete(key);
    if (deleted) saveVaultsToDisk();
    res.json({ deleted, syncKey: key });
  });

  app.delete("/api/admin/rooms/:roomCode", requireAdmin, (req, res) => {
    const code = req.params.roomCode.trim().toUpperCase();
    const deleted = syncRooms.delete(code);
    res.json({ deleted, roomCode: code });
  });

  // Server-Side TMDB Proxy (/api/*) matching mstream's edge proxy pattern
  app.get("/api/*", async (req, res) => {
    const token = process.env.TMDB_READ_ACCESS_TOKEN || process.env.VITE_TMDB_READ_ACCESS_TOKEN;
    const apiKey = process.env.TMDB_API_KEY;

    if (!token && !apiKey) {
      res.status(503).json({
        success: false,
        status_message: "TMDB credentials are not configured on the server.",
      });
      return;
    }

    const tmdbSubPath = req.path.replace(/^\/api/, "");
    const queryIndex = req.originalUrl.indexOf("?");
    const rawQuery = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
    const cacheKey = `${tmdbSubPath}${rawQuery}`;

    const bypassCache = req.query._fresh === "1";
    const now = Date.now();
    if (!bypassCache && serverCache.has(cacheKey)) {
      const entry = serverCache.get(cacheKey)!;
      if (entry.expiresAt > now) {
        cacheHits += 1;
        res.setHeader("X-Cache-Status", "HIT");
        res.setHeader("Cache-Control", "public, max-age=1200");
        res.json(entry.data);
        return;
      }
      serverCache.delete(cacheKey);
    }

    cacheMisses += 1;

    try {
      const normalizedBase = TMDB_BASE_URL.replace(/\/+$/, "");
      const upstreamUrl = new URL(`${normalizedBase}${tmdbSubPath}${rawQuery}`);
      upstreamUrl.searchParams.delete("_fresh");
      if (!token && apiKey) {
        upstreamUrl.searchParams.set("api_key", apiKey);
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const upstreamRes = await fetch(upstreamUrl.toString(), {
        headers,
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
        console.error(`TMDB error ${upstreamRes.status} for ${upstreamUrl.toString()}:`, data);
        res.status(upstreamRes.status).json(data);
        return;
      }

      const ttl = getCacheTtlMs(tmdbSubPath);
      serverCache.set(cacheKey, {
        data,
        cachedAt: now,
        expiresAt: now + ttl,
      });
      if (!lastCatalogSyncAt) {
        lastCatalogSyncAt = now;
      }

      res.setHeader("X-Cache-Status", "MISS");
      res.setHeader("Cache-Control", "public, max-age=1200");
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upstream error";
      res.status(502).json({
        success: false,
        status_message: `Failed to reach TMDB upstream: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    // Zero-WebSocket Vite client shim so /@vite/client never opens a failing WS in iframe previews
    app.get("/@vite/client", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(`export class ErrorOverlay {}
export function createHotContext() {
  return {
    accept() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {}
  };
}
export function injectQuery(url) { return url; }
export function updateStyle(id, content) {
  let style = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("data-vite-dev-id", id);
    document.head.appendChild(style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  document.querySelectorAll(\`style[data-vite-dev-id="\${id}"]\`).forEach((el) => el.remove());
}
`);
    });

    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`XEROTV server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
