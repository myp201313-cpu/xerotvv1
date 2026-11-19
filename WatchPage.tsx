import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Film,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  SkipForward,
  Star,
  Subtitles,
  Tv,
  Video,
} from "lucide-react";
import { useTMDB } from "../hooks/useTMDB";
import { useSync } from "../context/SyncContext";
import {
  buildSafeDownloadFilename,
} from "../utils/downloadResolver";
import {
  buildStreamUrl,
  formatRating,
  getMediaTitle,
  getMediaYear,
  getPosterUrl,
} from "../utils/catalogLogic";
import type {
  MediaDownloadResponse,
  MediaType,
  SyncRoomState,
  TMDBMediaItem,
  TVEpisode,
  TVSeason,
} from "../types/media";

interface MirrorStatus {
  ok: boolean;
  sandboxCompatible?: boolean;
  latencyMs: number;
}

const TRUSTED_PLAYER_ORIGINS = new Set([
  "https://vidzen.fun",
  "https://web.nxsha.app",
  "https://player.vidzee.wtf",
  "https://autoembed.co",
  "https://www.nontongo.win",
  "https://www.2embed.cc",
]);

export const WatchPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const mediaType = (params.get("type") === "tv" ? "tv" : "movie") as MediaType;
  const mediaId = params.get("id");
  const initialSeason = Math.max(1, Number(params.get("season")) || 1);
  const initialEpisode = Math.max(1, Number(params.get("episode")) || 1);
  const initialRoom = params.get("room") || "";

  const {
    preferences,
    runtimeConfig,
    isInLibrary,
    toggleLibrary,
    recordWatchHistory,
    updatePreferences,
  } = useSync();

  const servers = runtimeConfig.servers;
  const defaultServerIndex = Math.max(
    0,
    servers.findIndex((s) => s.id === runtimeConfig.defaultServerId),
  );

  const initialServerParam = params.get("server");
  const startServer =
    initialServerParam !== null
      ? Math.max(0, Math.min(Number(initialServerParam) || 0, servers.length - 1))
      : Math.max(
          0,
          Math.min(
            preferences.preferredServerIndex ?? defaultServerIndex,
            servers.length - 1,
          ),
        );

  const [currentServer, setCurrentServer] = useState(startServer);
  const [sandboxEnabled, setSandboxEnabled] = useState(
    runtimeConfig.enforceSandbox ||
      (servers[startServer]?.defaultSandbox ?? preferences.sandboxDefault),
  );
  const [currentSeason, setCurrentSeason] = useState(initialSeason);
  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);
  const [contentInfo, setContentInfo] = useState<TMDBMediaItem | null>(null);
  const [seasons, setSeasons] = useState<TVSeason[]>([]);
  const [episodes, setEpisodes] = useState<TVEpisode[]>([]);
  const [recommendations, setRecommendations] = useState<TMDBMediaItem[]>([]);
  const [castList, setCastList] = useState<string[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"stream" | "trailer">("stream");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Player status & fullscreen controls
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeStalled, setIframeStalled] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState<number | null>(null);

  // Real downloads & subtitles state
  const [downloadsData, setDownloadsData] = useState<MediaDownloadResponse | null>(null);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);

  // Watch Party Sync Room state
  const [roomCode, setRoomCode] = useState(initialRoom.toUpperCase());
  const [roomCopied, setRoomCopied] = useState(false);
  const [roomSyncInfo, setRoomSyncInfo] = useState<string | null>(null);
  const [mirrorHealth, setMirrorHealth] = useState<Record<string, MirrorStatus>>({});
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const roomChannelRef = useRef<BroadcastChannel | null>(null);
  const lastRecordedKeyRef = useRef<string>("");
  const lastProgressSyncRef = useRef<number>(0);

  const {
    fetchDetails,
    fetchCredits,
    fetchSeasonEpisodes,
    fetchRecommendations,
    fetchVideos,
  } = useTMDB();

  useEffect(() => {
    const nextParams = new URLSearchParams(location.search);
    setCurrentSeason(Math.max(1, Number(nextParams.get("season")) || 1));
    setCurrentEpisode(Math.max(1, Number(nextParams.get("episode")) || 1));
    setRoomCode((nextParams.get("room") || "").toUpperCase());
    const srvParam = nextParams.get("server");
    if (srvParam !== null) {
      const idx = Math.max(0, Math.min(Number(srvParam) || 0, servers.length - 1));
      setCurrentServer(idx);
      setSandboxEnabled(
        runtimeConfig.enforceSandbox || (servers[idx]?.defaultSandbox ?? true),
      );
    }
  }, [location.search, runtimeConfig.enforceSandbox, servers]);

  // Clamp server index if runtime server list changes from Admin
  useEffect(() => {
    if (currentServer >= servers.length) {
      setCurrentServer(0);
    }
  }, [currentServer, servers.length]);

  // Background check of mirror reachability & sandbox compatibility (once per servers update)
  useEffect(() => {
    let active = true;
    fetch("/api/servers/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { servers?: { id: string; ok: boolean; sandboxCompatible?: boolean; latencyMs: number }[] } | null) => {
        if (!active || !data?.servers) return;
        const map: Record<string, MirrorStatus> = {};
        for (const srv of data.servers) {
          map[srv.id] = {
            ok: srv.ok,
            sandboxCompatible: srv.sandboxCompatible,
            latencyMs: srv.latencyMs,
          };
        }
        setMirrorHealth(map);

        if (!initialServerParam) {
          setCurrentServer((prev) => {
            const activeId = servers[prev]?.id;
            if (activeId && map[activeId]?.ok === false) {
              const firstHealthyIdx = servers.findIndex((s) => map[s.id]?.ok);
              if (firstHealthyIdx >= 0 && firstHealthyIdx !== prev) {
                setSandboxEnabled(
                  runtimeConfig.enforceSandbox ||
                    (servers[firstHealthyIdx]?.defaultSandbox ?? true),
                );
                return firstHealthyIdx;
              }
            }
            return prev;
          });
        }
      })
      .catch(() => {
        // ignore probe hiccup
      });
    return () => {
      active = false;
    };
  }, [initialServerParam, runtimeConfig.enforceSandbox, servers]);

  // Fetch TMDB content metadata, trailer, seasons, and recommendations
  useEffect(() => {
    if (!mediaId) {
      setLoading(false);
      setErrorMsg("No title selected for playback.");
      return;
    }

    let active = true;
    const loadTitle = async () => {
      setLoading(true);
      setErrorMsg(null);
      setViewMode("stream");
      setContentInfo(null);
      setSeasons([]);
      setEpisodes([]);
      setCastList([]);
      setTrailerKey(null);
      setRecommendations([]);
      setRoomSyncInfo(null);
      setPlaybackProgress(null);
      setDownloadsData(null);

      try {
        const [details, recs, videos, cast] = await Promise.all([
          fetchDetails(mediaType, mediaId),
          fetchRecommendations(mediaType, mediaId),
          fetchVideos(mediaType, mediaId),
          fetchCredits(mediaType, mediaId),
        ]);
        if (!active) return;

        setContentInfo({ ...details, media_type: mediaType });
        setRecommendations(recs.slice(0, 10));
        setCastList(cast);

        const trailer =
          videos.find((v) => v.type === "Trailer" && v.official) ||
          videos.find((v) => v.type === "Trailer") ||
          videos[0];
        setTrailerKey(trailer?.key || null);

        if (mediaType === "tv" && Array.isArray(details.seasons)) {
          const validSeasons = details.seasons.filter((s) => s.season_number > 0);
          setSeasons(validSeasons);
        }
      } catch {
        if (active) setErrorMsg("Unable to fetch title metadata from TMDB.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTitle();
    return () => {
      active = false;
    };
  }, [fetchCredits, fetchDetails, fetchRecommendations, fetchVideos, mediaId, mediaType]);

  // Load episodes when TV season changes
  useEffect(() => {
    if (mediaType !== "tv" || !mediaId) return;
    let active = true;
    fetchSeasonEpisodes(mediaId, currentSeason)
      .then((eps) => {
        if (active) setEpisodes(eps);
      })
      .catch(() => {
        if (active) setEpisodes([]);
      });
    return () => {
      active = false;
    };
  }, [currentSeason, fetchSeasonEpisodes, mediaId, mediaType]);

  // Fetch real direct downloads & subtitles for active movie / TV episode
  const loadDownloads = useCallback(
    async (fresh = false) => {
      if (!mediaId || !runtimeConfig.downloadsEnabled) {
        setDownloadsData(null);
        return;
      }
      setDownloadsLoading(true);
      setDownloadsError(null);
      try {
        const imdb =
          contentInfo?.imdb_id || contentInfo?.external_ids?.imdb_id || "";
        const qs = new URLSearchParams({
          type: mediaType,
          id: mediaId,
          season: String(currentSeason),
          episode: String(currentEpisode),
        });
        if (imdb) qs.set("imdb", imdb);
        if (fresh) qs.set("fresh", "1");

        const res = await fetch(`/api/media/downloads?${qs.toString()}`);
        if (!res.ok) throw new Error("Download resolver returned an error");
        const data = (await res.json()) as MediaDownloadResponse;
        setDownloadsData(data);
      } catch {
        setDownloadsError("Could not reach upstream download nodes right now.");
      } finally {
        setDownloadsLoading(false);
      }
    },
    [
      contentInfo?.external_ids?.imdb_id,
      contentInfo?.imdb_id,
      currentEpisode,
      currentSeason,
      mediaId,
      mediaType,
      runtimeConfig.downloadsEnabled,
    ],
  );

  useEffect(() => {
    if (!contentInfo || !mediaId) return;
    void loadDownloads(false);
  }, [contentInfo, loadDownloads, mediaId]);

  // Record Watch History whenever active title, episode, or mirror updates
  useEffect(() => {
    if (!contentInfo || !mediaId || Number(contentInfo.id) !== Number(mediaId)) return;
    const recordKey = `${mediaType}:${mediaId}:${currentSeason}:${currentEpisode}:${currentServer}`;
    if (lastRecordedKeyRef.current === recordKey) return;
    lastRecordedKeyRef.current = recordKey;

    recordWatchHistory({
      id: Number(mediaId),
      media_type: mediaType,
      title: getMediaTitle(contentInfo),
      poster_path: contentInfo.poster_path ?? null,
      backdrop_path: contentInfo.backdrop_path ?? null,
      vote_average: contentInfo.vote_average || 0,
      season: mediaType === "tv" ? currentSeason : undefined,
      episode: mediaType === "tv" ? currentEpisode : undefined,
      serverIndex: currentServer,
      watchedAt: Date.now(),
      progressPercent: 10,
    });
  }, [
    contentInfo,
    currentEpisode,
    currentSeason,
    currentServer,
    mediaId,
    mediaType,
    recordWatchHistory,
  ]);

  // Track embedded player postMessage events
  useEffect(() => {
    if (!contentInfo || !mediaId) return;
    const handleMessage = (event: MessageEvent) => {
      if (!TRUSTED_PLAYER_ORIGINS.has(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      setIframeReady(true);
      setIframeStalled(false);
      const envelope = payload as {
        type?: string;
        data?: { currentTime?: number; duration?: number; event?: string };
      };
      if (envelope.type !== "PLAYER_EVENT" || !envelope.data) return;

      const { currentTime, duration, event: playerEvent } = envelope.data;
      if (typeof currentTime === "number" && typeof duration === "number" && duration > 0) {
        const pct = Math.max(1, Math.min(100, Math.round((currentTime / duration) * 100)));
        setPlaybackProgress(pct);
        const now = Date.now();
        if (
          playerEvent === "ended" ||
          playerEvent === "pause" ||
          now - lastProgressSyncRef.current > 15000
        ) {
          lastProgressSyncRef.current = now;
          recordWatchHistory({
            id: Number(mediaId),
            media_type: mediaType,
            title: getMediaTitle(contentInfo),
            poster_path: contentInfo.poster_path ?? null,
            backdrop_path: contentInfo.backdrop_path ?? null,
            vote_average: contentInfo.vote_average || 0,
            season: mediaType === "tv" ? currentSeason : undefined,
            episode: mediaType === "tv" ? currentEpisode : undefined,
            serverIndex: currentServer,
            watchedAt: now,
            progressPercent: playerEvent === "ended" ? 100 : pct,
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    contentInfo,
    currentEpisode,
    currentSeason,
    currentServer,
    mediaId,
    mediaType,
    recordWatchHistory,
  ]);

  const streamUrl = mediaId
    ? buildStreamUrl(currentServer, mediaType, mediaId, currentSeason, currentEpisode, servers)
    : "";

  useEffect(() => {
    if (viewMode !== "stream" || !streamUrl) return;
    setIframeReady(false);
    setIframeStalled(false);
    const timer = setTimeout(() => {
      setIframeStalled(true);
    }, 7500);
    return () => clearTimeout(timer);
  }, [streamUrl, sandboxEnabled, reloadCount, viewMode]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = playerContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore if browser blocks fullscreen outside gesture
    }
  };

  const pushRoomState = useCallback(
    async (
      code: string,
      nextServer: number,
      nextSeason: number,
      nextEpisode: number,
    ) => {
      if (!code || !mediaId || !contentInfo || !runtimeConfig.roomsEnabled) return;
      const payload: SyncRoomState = {
        roomCode: code,
        mediaType,
        mediaId: Number(mediaId),
        title: getMediaTitle(contentInfo),
        season: nextSeason,
        episode: nextEpisode,
        serverIndex: nextServer,
        updatedBy: "viewer",
        updatedAt: Date.now(),
      };
      try {
        roomChannelRef.current?.postMessage(payload);
        await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setRoomSyncInfo(`Room ${code} synced`);
      } catch {
        // ignore network hiccups
      }
    },
    [contentInfo, mediaId, mediaType, runtimeConfig.roomsEnabled],
  );

  useEffect(() => {
    if (!roomCode || !runtimeConfig.roomsEnabled) return;
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(`xerotv_room_${roomCode}`);
      roomChannelRef.current = ch;
      ch.onmessage = (e) => {
        const state = e.data as SyncRoomState;
        if (state && state.mediaId === Number(mediaId)) {
          setCurrentServer(state.serverIndex);
          if (mediaType === "tv") {
            setCurrentSeason(state.season);
            setCurrentEpisode(state.episode);
          }
          setRoomSyncInfo(`Synced from room ${roomCode}`);
        }
      };
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}`);
        if (!res.ok) return;
        const state = (await res.json()) as SyncRoomState;
        if (state.mediaId === Number(mediaId)) {
          setCurrentServer((prev) => (prev !== state.serverIndex ? state.serverIndex : prev));
          if (mediaType === "tv") {
            setCurrentSeason((prev) => (prev !== state.season ? state.season : prev));
            setCurrentEpisode((prev) => (prev !== state.episode ? state.episode : prev));
          }
        }
      } catch {
        // ignore polling error
      }
    }, 4500);

    return () => {
      clearInterval(interval);
      roomChannelRef.current?.close();
      roomChannelRef.current = null;
    };
  }, [mediaId, mediaType, roomCode, runtimeConfig.roomsEnabled]);

  const updateUrlQuery = useCallback(
    (nextServer: number, nextSeason: number, nextEpisode: number) => {
      const nextParams = new URLSearchParams(location.search);
      nextParams.set("server", String(nextServer));
      if (mediaType === "tv") {
        nextParams.set("season", String(nextSeason));
        nextParams.set("episode", String(nextEpisode));
      }
      navigate(`${location.pathname}?${nextParams.toString()}`, { replace: true });
    },
    [location.pathname, location.search, mediaType, navigate],
  );

  const handleServerChange = (index: number) => {
    setCurrentServer(index);
    setSandboxEnabled(
      runtimeConfig.enforceSandbox || (servers[index]?.defaultSandbox ?? true),
    );
    updatePreferences({ preferredServerIndex: index });
    updateUrlQuery(index, currentSeason, currentEpisode);
    if (roomCode) {
      void pushRoomState(roomCode, index, currentSeason, currentEpisode);
    }
  };

  const handleNextWorkingMirror = () => {
    const total = servers.length;
    for (let offset = 1; offset <= total; offset += 1) {
      const candidateIdx = (currentServer + offset) % total;
      const srv = servers[candidateIdx];
      if (mirrorHealth[srv.id]?.ok !== false) {
        handleServerChange(candidateIdx);
        return;
      }
    }
    handleServerChange((currentServer + 1) % total);
  };

  const handleEpisodeSelect = (seasonNum: number, epNum: number) => {
    setCurrentSeason(seasonNum);
    setCurrentEpisode(epNum);
    updateUrlQuery(currentServer, seasonNum, epNum);
    if (roomCode) {
      void pushRoomState(roomCode, currentServer, seasonNum, epNum);
    }
  };

  const createSyncRoom = async () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomCode(code);
    await pushRoomState(code, currentServer, currentSeason, currentEpisode);
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    navigate(`${url.pathname}${url.search}`, { replace: true });
  };

  const copyRoomLink = async () => {
    if (!roomCode) return;
    const shareUrl = `${window.location.origin}/watch?type=${mediaType}&id=${mediaId}${
      mediaType === "tv" ? `&season=${currentSeason}&episode=${currentEpisode}` : ""
    }&server=${currentServer}&room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setRoomCopied(true);
      setTimeout(() => setRoomCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-10 sm:px-8">
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="h-28 animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  if (errorMsg || !contentInfo || !mediaId) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Playback Unavailable</h1>
        <p className="text-sm text-slate-400">{errorMsg || "Title not found."}</p>
        <Link
          to="/"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>
    );
  }

  const title = getMediaTitle(contentInfo);
  const year = getMediaYear(contentInfo);
  const rating = formatRating(contentInfo.vote_average);
  const poster = getPosterUrl(contentInfo.poster_path);
  const inLib = isInLibrary(contentInfo.id, mediaType);
  const genres = Array.isArray(contentInfo.genres)
    ? contentInfo.genres.map((g) => (typeof g === "string" ? g : g.name)).filter(Boolean)
    : [];
  const activeServer = servers[currentServer] || servers[0];

  const directDownloads = (downloadsData?.downloads || []).filter((d) => d.isDirectFile);
  const mirrorDownloads = (downloadsData?.downloads || []).filter((d) => !d.isDirectFile);
  const subtitleDownloads = downloadsData?.subtitles || [];

  const buildProxyDownloadHref = (
    rawUrl: string,
    quality: string,
    ext: string,
  ) => {
    const qs = new URLSearchParams({
      url: rawUrl,
      title,
      type: mediaType,
      quality,
      ext,
    });
    if (mediaType === "tv") {
      qs.set("season", String(currentSeason));
      qs.set("episode", String(currentEpisode));
    }
    return `/api/media/download-file?${qs.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-8 sm:px-8">
      {/* Top Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#12141d] px-4 text-xs font-semibold text-slate-200 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {playbackProgress !== null && (
            <span className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-slate-300 tabular-nums">
              Synced · {playbackProgress}%
            </span>
          )}

          {trailerKey && (
            <button
              type="button"
              onClick={() =>
                setViewMode((m) => (m === "stream" ? "trailer" : "stream"))
              }
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-4 text-xs font-semibold text-white hover:bg-white/10"
            >
              <Video className="h-4 w-4 text-rose-400" aria-hidden="true" />
              <span>{viewMode === "stream" ? "Watch Trailer" : "Back to Stream"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => toggleLibrary(contentInfo)}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-xs font-semibold transition-colors ${
              inLib
                ? "border-rose-500/50 bg-rose-600 text-white"
                : "border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/10"
            }`}
          >
            {inLib ? (
              <>
                <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                <span>In Library</span>
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                <span>Add to Library</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split: Player + Recommendations */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Player Frame */}
          <div
            ref={playerContainerRef}
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black"
          >
            <div className="relative aspect-video w-full bg-[#06070a]">
              {viewMode === "trailer" && trailerKey ? (
                <iframe
                  key={`trailer-${trailerKey}`}
                  src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`}
                  title={`${title} Official Trailer`}
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                />
              ) : (
                <>
                  <iframe
                    key={`${streamUrl}-${sandboxEnabled}-${reloadCount}`}
                    src={streamUrl}
                    title={`${title} Stream Player`}
                    onLoad={() => {
                      setIframeReady(true);
                      setIframeStalled(false);
                    }}
                    className="h-full w-full"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    referrerPolicy="no-referrer"
                    {...(sandboxEnabled
                      ? {
                          sandbox:
                            "allow-scripts allow-same-origin allow-forms allow-presentation",
                        }
                      : {})}
                  />
                  {!iframeReady && !iframeStalled && (
                    <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/75 px-3 py-1.5 text-xs font-medium text-slate-200">
                      Connecting to {activeServer.providerLabel}...
                    </div>
                  )}
                  {!iframeReady && iframeStalled && (
                    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-[#12141d]/95 p-3 text-xs text-slate-200 backdrop-blur-sm">
                      <span>
                        {activeServer.providerLabel} is taking longer than expected.
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleNextWorkingMirror}
                          className="rounded-md bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500"
                        >
                          Switch to Next Mirror
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Mirror & Sync Control Bar */}
            <div className="flex flex-col gap-4 border-t border-white/[0.08] bg-[#12141d] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <label htmlFor="watch-server-select" className="text-xs font-medium text-slate-300">
                  Mirror
                </label>
                <select
                  id="watch-server-select"
                  value={currentServer}
                  onChange={(e) => handleServerChange(Number(e.target.value))}
                  className="h-9 rounded-lg border border-white/10 bg-[#090a0f] px-3 text-xs font-medium text-white focus:border-rose-500 focus:outline-none"
                >
                  {servers.map((srv, idx) => (
                    <option key={srv.id} value={idx}>
                      {srv.name}
                      {srv.recommended ? " [Recommended]" : ""} ({srv.qualityHint})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleNextWorkingMirror}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  <SkipForward className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                  <span>Next Mirror</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReloadCount((c) => c + 1)}
                  title="Reload active player stream"
                  aria-label="Reload stream player"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-slate-200 hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Reload</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSandboxEnabled((prev) => !prev)}
                  title="Sandbox blocks third-party popups and redirects."
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                    sandboxEnabled
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {sandboxEnabled ? (
                    <>
                      <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sandbox: ON</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sandbox: OFF</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  title={isFullscreen ? "Exit fullscreen" : "Theater fullscreen"}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-slate-200 hover:bg-white/10"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Watch Party Sync Room */}
              {runtimeConfig.roomsEnabled && (
                <div className="flex flex-wrap items-center gap-2">
                  {roomCode ? (
                    <>
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-[#090a0f] px-3 font-mono text-xs text-slate-200 tabular-nums">
                        <Radio className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                        <span>Room {roomCode}</span>
                      </span>
                      <button
                        type="button"
                        onClick={copyRoomLink}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-white hover:bg-white/10"
                      >
                        {roomCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                            <span>Link Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Invite Link</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={createSyncRoom}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                    >
                      <Radio className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                      <span>Watch Sync Room</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mirror Quick Switch & Sandbox-Verified Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-[#0e1017] px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {servers.map((srv, idx) => {
                  const status = mirrorHealth[srv.id];
                  const isActive = currentServer === idx;
                  const statusColor =
                    status?.ok === true
                      ? "bg-emerald-400"
                      : status?.ok === false
                        ? "bg-amber-400"
                        : "bg-slate-500";
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => handleServerChange(idx)}
                      title={
                        status
                          ? `${srv.name} · ${status.ok ? "Sandbox Verified" : "Fallback"} (${status.latencyMs}ms)`
                          : srv.name
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors tabular-nums ${
                        isActive
                          ? "bg-rose-600 text-white"
                          : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-white" : statusColor}`}
                        aria-hidden="true"
                      />
                      <span>
                        {idx + 1}. {srv.providerLabel}
                        {srv.recommended ? " ★" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400">
                {roomSyncInfo
                  ? `${roomSyncInfo} · All listed mirrors verified for iframe sandbox.`
                  : "All mirrors verified for iframe sandbox · ★ Recommended"}
              </p>
            </div>
          </div>

          {/* Real Movie / Episode Direct Downloads & Subtitles */}
          {runtimeConfig.downloadsEnabled && (
            <section
              aria-labelledby="real-downloads-heading"
              className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#12141d] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h2
                    id="real-downloads-heading"
                    className="flex items-center gap-2 font-display text-lg font-bold text-white"
                  >
                    <Download className="h-4 w-4 text-rose-400" aria-hidden="true" />
                    <span>
                      Direct Downloads{" "}
                      {mediaType === "tv"
                        ? `(S${String(currentSeason).padStart(2, "0")}E${String(currentEpisode).padStart(2, "0")})`
                        : "(MP4 / MKV)"}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Verified upstream video files and subtitles resolved live for this{" "}
                    {mediaType === "tv" ? "episode" : "title"}.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void loadDownloads(true)}
                  disabled={downloadsLoading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${downloadsLoading ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>{downloadsLoading ? "Resolving..." : "Refresh Sources"}</span>
                </button>
              </div>

              {downloadsLoading ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((k) => (
                    <div
                      key={k}
                      className="h-14 animate-pulse rounded-xl bg-white/[0.04]"
                    />
                  ))}
                </div>
              ) : downloadsError ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  {downloadsError}
                </p>
              ) : directDownloads.length === 0 && mirrorDownloads.length === 0 ? (
                <p className="rounded-xl border border-white/[0.06] bg-[#090a0f] p-4 text-xs text-slate-400">
                  No upstream direct download files were returned for this{" "}
                  {mediaType === "tv" ? "episode" : "title"} right now. Try switching mirrors or refreshing sources later.
                </p>
              ) : (
                <div className="space-y-4">
                  {directDownloads.length > 0 && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {directDownloads.slice(0, 10).map((item) => {
                        const ext = item.format.toLowerCase() === "mkv" ? "mkv" : "mp4";
                        const filename = buildSafeDownloadFilename(
                          title,
                          mediaType,
                          item.quality,
                          ext,
                          mediaType === "tv" ? currentSeason : undefined,
                          mediaType === "tv" ? currentEpisode : undefined,
                        );
                        return (
                          <a
                            key={item.id}
                            href={buildProxyDownloadHref(item.url, item.quality, ext)}
                            download={filename}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#090a0f] p-3 text-left transition-colors hover:border-rose-500/50 hover:bg-white/[0.04]"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <p className="truncate text-xs font-semibold text-white">
                                {item.quality} · {item.format} · {item.language}
                              </p>
                              <p className="truncate text-[11px] text-slate-400 tabular-nums">
                                {item.provider}
                                {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                              </p>
                            </div>
                            <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white">
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{item.format}</span>
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {mirrorDownloads.length > 0 && (
                    <div className="space-y-2 border-t border-white/[0.06] pt-3">
                      <p className="text-[11px] font-medium text-slate-400">
                        External File Mirrors
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {mirrorDownloads.slice(0, 4).map((item) => (
                          <a
                            key={item.id}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#090a0f] px-3 py-2 text-xs text-slate-200 hover:border-white/20 hover:text-white"
                          >
                            <span className="truncate">{item.label}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {subtitleDownloads.length > 0 && (
                    <div className="space-y-2 border-t border-white/[0.06] pt-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                        <Subtitles className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                        <span>Subtitles (.VTT / .SRT)</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {subtitleDownloads.slice(0, 12).map((sub) => {
                          const subExt = sub.format.toLowerCase();
                          const subFile = buildSafeDownloadFilename(
                            title,
                            mediaType,
                            sub.language,
                            subExt,
                            mediaType === "tv" ? currentSeason : undefined,
                            mediaType === "tv" ? currentEpisode : undefined,
                          );
                          return (
                            <a
                              key={sub.id}
                              href={buildProxyDownloadHref(sub.url, sub.language, subExt)}
                              download={subFile}
                              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#090a0f] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-rose-500/40 hover:text-white"
                            >
                              <Download className="h-3 w-3 text-rose-400" aria-hidden="true" />
                              <span>{sub.language}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* TV Episodes Selector */}
          {mediaType === "tv" && seasons.length > 0 && (
            <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#12141d] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-lg font-bold text-white">
                    Episodes
                  </h2>
                  {episodes.some((ep) => ep.episode_number === currentEpisode - 1) && (
                    <button
                      type="button"
                      onClick={() => handleEpisodeSelect(currentSeason, currentEpisode - 1)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-xs font-medium text-slate-200 hover:bg-white/10"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Prev</span>
                    </button>
                  )}
                  {episodes.some((ep) => ep.episode_number === currentEpisode + 1) && (
                    <button
                      type="button"
                      onClick={() => handleEpisodeSelect(currentSeason, currentEpisode + 1)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-600/20 px-3 text-xs font-semibold text-rose-300 hover:bg-rose-600 hover:text-white transition-colors"
                    >
                      <span>Next Episode</span>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="watch-season-select" className="text-xs text-slate-400">
                    Season
                  </label>
                  <select
                    id="watch-season-select"
                    value={currentSeason}
                    onChange={(e) => handleEpisodeSelect(Number(e.target.value), 1)}
                    className="h-9 rounded-lg border border-white/10 bg-[#090a0f] px-3 text-xs font-medium text-white focus:border-rose-500 focus:outline-none"
                  >
                    {seasons.map((s) => (
                      <option key={s.season_number} value={s.season_number}>
                        {s.name} ({s.episode_count} eps)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {episodes.map((ep) => {
                  const activeEp = ep.episode_number === currentEpisode;
                  const stillUrl = ep.still_path
                    ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
                    : null;
                  return (
                    <button
                      key={ep.episode_number}
                      type="button"
                      onClick={() => handleEpisodeSelect(currentSeason, ep.episode_number)}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                        activeEp
                          ? "border-rose-500/60 bg-rose-600/15"
                          : "border-white/[0.06] bg-[#090a0f]/70 hover:border-white/20"
                      }`}
                    >
                      {stillUrl && (
                        <img
                          src={stillUrl}
                          alt={`Episode ${ep.episode_number}`}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="h-12 w-20 shrink-0 rounded-md object-cover bg-[#191c28]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-rose-400 tabular-nums">
                            E{String(ep.episode_number).padStart(2, "0")}
                          </span>
                          <p className="truncate text-sm font-medium text-white">
                            {ep.name}
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400 tabular-nums">
                          {ep.runtime && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {ep.runtime}m
                            </span>
                          )}
                          {ep.air_date && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" aria-hidden="true" />
                              {ep.air_date}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Title Details Block */}
          <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-[#12141d] p-5 sm:flex-row">
            <div className="w-28 shrink-0">
              {poster ? (
                <img
                  src={poster}
                  alt={title}
                  referrerPolicy="no-referrer"
                  className="aspect-[2/3] w-full rounded-xl object-cover bg-[#191c28]"
                />
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-[#191c28] text-slate-500">
                  {mediaType === "tv" ? (
                    <Tv className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Film className="h-6 w-6" aria-hidden="true" />
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-300 tabular-nums">
                <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                  <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                  {rating}
                </span>
                {year && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{year}</span>
                  </>
                )}
                {contentInfo.runtime ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{contentInfo.runtime} min</span>
                  </>
                ) : null}
                <span aria-hidden="true">·</span>
                <span>{mediaType === "tv" ? "TV Series" : "Movie"}</span>
              </div>
              {genres.length > 0 && (
                <p className="text-xs text-slate-400">{genres.join(" · ")}</p>
              )}
              <p className="text-sm leading-relaxed text-slate-300">
                {contentInfo.overview || "No synopsis available."}
              </p>
              {castList.length > 0 && (
                <p className="text-xs leading-relaxed text-slate-400">
                  <strong className="font-semibold text-slate-200">Cast: </strong>
                  {castList.join(", ")}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Recommendations Sidebar */}
        <aside className="space-y-4">
          <h2 className="font-display text-lg font-bold text-white">
            Recommended Next
          </h2>
          {recommendations.length === 0 ? (
            <p className="rounded-xl border border-white/[0.08] bg-[#12141d] p-4 text-xs text-slate-400">
              No similar titles returned by TMDB for this entry.
            </p>
          ) : (
            <div className="space-y-2.5">
              {recommendations.map((rec) => {
                const recType = rec.media_type === "tv" || rec.first_air_date ? "tv" : mediaType;
                const recPoster = getPosterUrl(rec.poster_path, true);
                const recTitle = getMediaTitle(rec);
                const recRating = formatRating(rec.vote_average);
                return (
                  <Link
                    key={`${recType}-${rec.id}`}
                    to={`/watch?type=${recType}&id=${rec.id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#12141d] p-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  >
                    {recPoster ? (
                      <img
                        src={recPoster}
                        alt={recTitle}
                        referrerPolicy="no-referrer"
                        className="h-14 w-10 shrink-0 rounded-md object-cover bg-[#191c28]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-[#191c28] text-slate-500">
                        <Film className="h-4 w-4" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {recTitle}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-400 tabular-nums">
                        <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                        {recRating}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
