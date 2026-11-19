import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, RefreshCw, X } from "lucide-react";
import { HeroBanner } from "../components/HeroBanner";
import { MediaRow } from "../components/MediaRow";
import { DetailModal, type DetailModalItem } from "../components/DetailModal";
import { TrendingSidebar } from "../components/TrendingSidebar";
import { useTMDB } from "../hooks/useTMDB";
import { useSync } from "../context/SyncContext";
import { extractGenreNames, getPosterUrl, resolveMediaType } from "../utils/catalogLogic";
import type { LibraryEntry, TMDBMediaItem } from "../types/media";

export const Home: React.FC = () => {
  const [nowPlaying, setNowPlaying] = useState<TMDBMediaItem[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<TMDBMediaItem[]>([]);
  const [trendingTV, setTrendingTV] = useState<TMDBMediaItem[]>([]);
  const [trendingAnime, setTrendingAnime] = useState<TMDBMediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMediaItem[]>([]);
  const [timeWindow, setTimeWindow] = useState<"week" | "day">("week");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<DetailModalItem | null>(null);

  const {
    movieGenres,
    tvGenres,
    fetchNowPlaying,
    fetchTrending,
    fetchTrendingAnime,
    fetchPopularMovies,
    fetchCredits,
  } = useTMDB();

  const { history, removeHistoryItem, catalogRefreshTick } = useSync();

  const loadHomeCatalog = useCallback(
    async (
      windowVal: "week" | "day",
      forceFresh = false,
      isActive: () => boolean = () => true,
    ) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [np, tMovies, tTv, anime, popular] = await Promise.all([
          fetchNowPlaying(forceFresh),
          fetchTrending("movie", windowVal, forceFresh),
          fetchTrending("tv", windowVal, forceFresh),
          fetchTrendingAnime(forceFresh),
          fetchPopularMovies({ page: 1 }),
        ]);
        if (!isActive()) return;
        setNowPlaying(np.slice(0, 8));
        setTrendingMovies(tMovies.slice(0, 18));
        setTrendingTV(tTv.slice(0, 18));
        setTrendingAnime(anime.slice(0, 18));
        setPopularMovies((popular.results || []).slice(0, 18));
      } catch {
        if (isActive()) {
          setErrorMsg("Unable to load TMDB catalog right now. Please retry.");
        }
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [
      fetchNowPlaying,
      fetchPopularMovies,
      fetchTrending,
      fetchTrendingAnime,
    ],
  );

  useEffect(() => {
    let active = true;
    void loadHomeCatalog(timeWindow, catalogRefreshTick > 0, () => active);
    return () => {
      active = false;
    };
  }, [catalogRefreshTick, loadHomeCatalog, timeWindow]);

  const handleSelectItem = async (item: TMDBMediaItem | LibraryEntry) => {
    const mediaType = resolveMediaType(item);
    const genreMap = mediaType === "movie" ? movieGenres : tvGenres;
    const genreNames = extractGenreNames(item, genreMap);

    setSelectedItem({
      ...item,
      media_type: mediaType,
      resolvedGenres: genreNames,
    });

    const cast = await fetchCredits(mediaType, item.id);
    setSelectedItem((prev) =>
      prev && prev.id === item.id ? { ...prev, cast: cast.join(", ") || "N/A" } : prev,
    );
  };

  if (loading && nowPlaying.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-10 px-4 py-8 sm:px-8">
        <div className="h-[440px] animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg && nowPlaying.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Catalog Unavailable</h1>
        <p className="text-sm text-slate-400">{errorMsg}</p>
        <button
          type="button"
          onClick={() => loadHomeCatalog(timeWindow, true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry Catalog Sync
        </button>
      </div>
    );
  }

  return (
    <div>
      <HeroBanner items={nowPlaying} onMoreInfo={handleSelectItem} />

      <div className="mx-auto max-w-[1440px] space-y-12 px-4 py-10 sm:px-8">
        {/* Synced Continue Watching Shelf */}
        {history.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
                Continue Watching
              </h2>
              <Link
                to="/library"
                className="text-xs sm:text-sm font-medium text-rose-400 hover:text-rose-300"
              >
                Manage history →
              </Link>
            </div>
            <div className="cinema-scroll flex gap-4 overflow-x-auto pb-2">
              {history.slice(0, 10).map((entry) => {
                const poster = getPosterUrl(entry.poster_path);
                const watchHref =
                  entry.media_type === "tv"
                    ? `/watch?type=tv&id=${entry.id}&season=${entry.season || 1}&episode=${entry.episode || 1}&server=${entry.serverIndex}`
                    : `/watch?type=movie&id=${entry.id}&server=${entry.serverIndex}`;

                return (
                  <div
                    key={`${entry.media_type}-${entry.id}`}
                    className="group relative w-[240px] shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#12141d]"
                  >
                    <Link
                      to={watchHref}
                      className="flex items-center gap-3 p-3 hover:bg-white/[0.04] transition-colors"
                    >
                      {poster ? (
                        <img
                          src={poster}
                          alt={entry.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-11 shrink-0 rounded-md object-cover bg-[#191c28]"
                        />
                      ) : (
                        <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-[#191c28] text-slate-500">
                          <Play className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 pr-5">
                        <p className="truncate text-sm font-semibold text-white">
                          {entry.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 tabular-nums">
                          {entry.media_type === "tv"
                            ? `S${entry.season || 1} E${entry.episode || 1}`
                            : "Movie"}{" "}
                          · Server {entry.serverIndex + 1}
                        </p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeHistoryItem(entry.id, entry.media_type)}
                      aria-label={`Remove ${entry.title} from history`}
                      className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Trending Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#12141d] p-1" role="tablist" aria-label="Trending window">
            <button
              type="button"
              role="tab"
              aria-selected={timeWindow === "week"}
              onClick={() => setTimeWindow("week")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                timeWindow === "week"
                  ? "bg-rose-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeWindow === "day"}
              onClick={() => setTimeWindow("day")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                timeWindow === "day"
                  ? "bg-rose-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Today
            </button>
          </div>

          <Link
            to="/sync"
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Manage Cross-Device Sync &amp; Catalog Cache →
          </Link>
        </div>

        <MediaRow
          title={`Trending Movies (${timeWindow === "day" ? "Today" : "This Week"})`}
          items={trendingMovies}
          onSelectItem={handleSelectItem}
          exploreTo="/movies"
          exploreLabel="Browse Movies"
          genreMap={movieGenres}
        />

        <MediaRow
          title={`Trending TV Shows (${timeWindow === "day" ? "Today" : "This Week"})`}
          items={trendingTV}
          onSelectItem={handleSelectItem}
          exploreTo="/tv-shows"
          exploreLabel="Browse TV Shows"
          genreMap={tvGenres}
        />

        <MediaRow
          title="Popular Worldwide"
          items={popularMovies}
          onSelectItem={handleSelectItem}
          exploreTo="/popular"
          exploreLabel="Explore Popular"
          genreMap={movieGenres}
        />

        <MediaRow
          title="Trending Anime Series"
          items={trendingAnime}
          onSelectItem={handleSelectItem}
          exploreTo="/tv-shows"
          exploreLabel="All Series"
          genreMap={tvGenres}
        />

        <TrendingSidebar
          trendingMovies={trendingMovies}
          trendingTV={trendingTV}
          timeWindow={timeWindow}
          onSelectItem={handleSelectItem}
        />
      </div>

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
};
