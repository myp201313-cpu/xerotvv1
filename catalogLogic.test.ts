import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAdminConfigToServers,
  buildStreamUrl,
  createDefaultAdminConfig,
  filterAndSortLibrary,
  formatRating,
  formatSyncCode,
  isValidSyncCode,
  mergeSyncVaults,
  normalizeLibraryEntry,
  resolveMediaType,
  STREAMING_SERVERS,
} from "./catalogLogic";
import { buildWindowsShortcut } from "./zipBuilder";
import type { LibraryEntry, SyncVaultPayload } from "../types/media";

test("resolveMediaType infers movie or tv accurately", () => {
  assert.equal(resolveMediaType({ id: 1, media_type: "tv" }), "tv");
  assert.equal(resolveMediaType({ id: 2, first_air_date: "2024-01-01" }), "tv");
  assert.equal(resolveMediaType({ id: 3, release_date: "2025-05-01" }), "movie");
});

test("STREAMING_SERVERS restores Vidzen & NXSHA as recommended sandbox-verified mirrors only", () => {
  assert.equal(STREAMING_SERVERS[0].id, "vidzen");
  assert.equal(STREAMING_SERVERS[0].recommended, true);
  assert.equal(STREAMING_SERVERS[1].id, "nxsha");
  assert.equal(STREAMING_SERVERS[1].recommended, true);
  assert.ok(STREAMING_SERVERS.every((s) => s.sandboxVerified && s.defaultSandbox));

  assert.equal(buildStreamUrl(0, "movie", 550), "https://vidzen.fun/movie/550");
  assert.equal(buildStreamUrl(0, "tv", 1396, 2, 7), "https://vidzen.fun/tv/1396/2/7");
  assert.equal(buildStreamUrl(1, "movie", 550), "https://web.nxsha.app/embed/movie/550");
  assert.equal(buildStreamUrl(1, "tv", 1396, 1, 3), "https://web.nxsha.app/embed/tv/1396/1/3");
  assert.equal(buildStreamUrl(2, "movie", 550), "https://player.vidzee.wtf/embed/movie/550");
  assert.equal(buildStreamUrl(4, "tv", 1396, 1, 3), "https://autoembed.co/tv/tmdb/1396-1-3");
  assert.equal(buildStreamUrl(99, "movie", 101), "https://www.2embed.cc/embed/101");
});

test("applyAdminConfigToServers filters disabled mirrors and honors ordering", () => {
  const cfg = createDefaultAdminConfig();
  cfg.serverOverrides.vidzen.enabled = false;
  cfg.serverOverrides.nxsha.order = 0;
  cfg.serverOverrides.vidzee.order = 1;
  const active = applyAdminConfigToServers(cfg, false);
  assert.equal(active.some((s) => s.id === "vidzen"), false);
  assert.equal(active[0].id, "nxsha");
});

test("buildWindowsShortcut outputs valid Windows InternetShortcut INI format", () => {
  const ini = buildWindowsShortcut("https://xerotv.example.com/");
  assert.equal(ini, "[InternetShortcut]\r\nURL=https://xerotv.example.com/\r\nIconIndex=0\r\n");
});

test("formatRating handles valid and missing ratings", () => {
  assert.equal(formatRating(8.46), "8.5");
  assert.equal(formatRating(0), "NR");
  assert.equal(formatRating(null), "NR");
});

test("filterAndSortLibrary filters by type and query and sorts deterministically", () => {
  const sample: LibraryEntry[] = [
    {
      id: 1,
      media_type: "movie",
      title: "Dune: Part Two",
      poster_path: "/a.jpg",
      backdrop_path: "/b.jpg",
      vote_average: 8.3,
      release_date: "2024-02-27",
      overview: "",
      genres: ["Sci-Fi"],
      addedAt: 1000,
    },
    {
      id: 2,
      media_type: "tv",
      title: "Severance",
      poster_path: "/c.jpg",
      backdrop_path: "/d.jpg",
      vote_average: 8.9,
      release_date: "2022-02-18",
      overview: "",
      genres: ["Drama"],
      addedAt: 2000,
    },
    {
      id: 3,
      media_type: "movie",
      title: "Arrival",
      poster_path: "/e.jpg",
      backdrop_path: "/f.jpg",
      vote_average: 7.9,
      release_date: "2016-11-11",
      overview: "",
      genres: ["Sci-Fi"],
      addedAt: 3000,
    },
  ];

  const moviesOnly = filterAndSortLibrary(sample, { type: "movie", sort: "rating" });
  assert.deepEqual(
    moviesOnly.map((m) => m.title),
    ["Dune: Part Two", "Arrival"],
  );

  const searchMatches = filterAndSortLibrary(sample, { query: "sever" });
  assert.equal(searchMatches.length, 1);
  assert.equal(searchMatches[0].id, 2);
});

test("mergeSyncVaults merges library and history by latest timestamp without dropping items", () => {
  const localVault: SyncVaultPayload = {
    syncKey: "XERO-1111-2222",
    deviceId: "dev_local",
    library: [
      normalizeLibraryEntry({
        id: 10,
        media_type: "movie",
        title: "Local Movie",
        vote_average: 7.5,
      }),
    ],
    history: [
      {
        id: 10,
        media_type: "movie",
        title: "Local Movie",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7.5,
        serverIndex: 1,
        watchedAt: 5000,
        progressPercent: 40,
      },
    ],
    preferences: {
      preferredServerIndex: 1,
      sandboxDefault: true,
      autoSyncEnabled: true,
      region: "US",
      language: "en-US",
    },
    lastCatalogSyncAt: 4000,
    updatedAt: 5000,
  };

  const remoteVault: SyncVaultPayload = {
    syncKey: "XERO-1111-2222",
    deviceId: "dev_remote",
    library: [
      normalizeLibraryEntry({
        id: 20,
        media_type: "tv",
        name: "Remote Show",
        vote_average: 8.8,
      }),
    ],
    history: [
      {
        id: 10,
        media_type: "movie",
        title: "Local Movie",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7.5,
        serverIndex: 0,
        watchedAt: 2000,
        progressPercent: 10,
      },
    ],
    preferences: {
      preferredServerIndex: 0,
      sandboxDefault: false,
      autoSyncEnabled: true,
      region: "US",
      language: "en-US",
    },
    lastCatalogSyncAt: 6000,
    updatedAt: 3000,
  };

  const merged = mergeSyncVaults(localVault, remoteVault);
  assert.equal(merged.library.length, 2);
  assert.equal(merged.history[0].serverIndex, 1);
  assert.equal(merged.preferences.preferredServerIndex, 1);
  assert.equal(merged.lastCatalogSyncAt, 6000);
});

test("formatSyncCode and isValidSyncCode normalize and validate sync keys", () => {
  assert.equal(formatSyncCode("xero ab12 cd34"), "XERO-AB12-CD34");
  assert.equal(formatSyncCode("ab12cd34"), "XERO-AB12-CD34");
  assert.equal(isValidSyncCode("XERO-AB12-CD34"), true);
  assert.equal(isValidSyncCode("INVALID"), false);
});
