import { useCallback, useEffect, useMemo, useState } from "react";
import { CACHE_TTL, cachedFetch, clearApiCache } from "../services/apiCache";
import { rateLimiter } from "../services/rateLimiter";
import type {
  GenreItem,
  MediaType,
  TMDBMediaItem,
  TVEpisode,
  VideoResult,
} from "../types/media";

interface TMDBListResponse<T> {
  page?: number;
  results?: T[];
  total_pages?: number;
  total_results?: number;
}

type ApiStatus = "checking" | "working" | "error";

let sharedMovieGenres = new Map<number, string>();
let sharedTvGenres = new Map<number, string>();
let sharedApiStatus: ApiStatus = "checking";
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notifySharedState() {
  listeners.forEach((fn) => fn());
}

export function useTMDB() {
  const [movieGenres, setMovieGenres] = useState<Map<number, string>>(sharedMovieGenres);
  const [tvGenres, setTvGenres] = useState<Map<number, string>>(sharedTvGenres);
  const [apiStatus, setApiStatus] = useState<ApiStatus>(sharedApiStatus);

  const buildUrl = useCallback(
    (endpoint: string, params: Record<string, string | number | boolean | undefined> = {}) => {
      const url = new URL(`/api${endpoint}`, window.location.origin);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.append(key, String(value));
        }
      });
      return url.toString();
    },
    [],
  );

  const safeFetch = useCallback(
    async <T,>(url: string, ttl: number = CACHE_TTL.MEDIUM, forceFresh = false): Promise<T> => {
      return rateLimiter.execute(() =>
        cachedFetch<T>(
          url,
          async () => {
            const target = forceFresh
              ? `${url}${url.includes("?") ? "&" : "?"}_fresh=1`
              : url;
            const res = await fetch(target);
            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              const err = new Error(`TMDB request failed (${res.status}): ${errText}`) as Error & {
                status?: number;
              };
              err.status = res.status;
              throw err;
            }
            return (await res.json()) as T;
          },
          ttl,
          forceFresh,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const syncLocal = () => {
      setMovieGenres(sharedMovieGenres);
      setTvGenres(sharedTvGenres);
      setApiStatus(sharedApiStatus);
    };
    listeners.add(syncLocal);

    if (!initPromise) {
      initPromise = (async () => {
        try {
          await safeFetch<unknown>(buildUrl("/configuration"), CACHE_TTL.STATIC);
          sharedApiStatus = "working";
        } catch {
          sharedApiStatus = "error";
        }
        notifySharedState();

        try {
          const [movieData, tvData] = await Promise.all([
            safeFetch<{ genres?: GenreItem[] }>(buildUrl("/genre/movie/list"), CACHE_TTL.STATIC),
            safeFetch<{ genres?: GenreItem[] }>(buildUrl("/genre/tv/list"), CACHE_TTL.STATIC),
          ]);
          sharedMovieGenres = new Map((movieData.genres || []).map((g) => [g.id, g.name]));
          sharedTvGenres = new Map((tvData.genres || []).map((g) => [g.id, g.name]));
          notifySharedState();
        } catch (err) {
          console.error("Failed to fetch TMDB genres:", err);
        }
      })();
    } else {
      syncLocal();
    }

    return () => {
      listeners.delete(syncLocal);
    };
  }, [buildUrl, safeFetch]);

  const fetchNowPlaying = useCallback(
    async (forceFresh = false): Promise<TMDBMediaItem[]> => {
      const data = await safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl("/movie/now_playing", { language: "en-US", page: 1 }),
        CACHE_TTL.MEDIUM,
        forceFresh,
      );
      return data.results || [];
    },
    [buildUrl, safeFetch],
  );

  const fetchTrending = useCallback(
    async (
      type: MediaType | "all",
      timeWindow: "day" | "week" = "week",
      forceFresh = false,
    ): Promise<TMDBMediaItem[]> => {
      const data = await safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl(`/trending/${type}/${timeWindow}`),
        CACHE_TTL.MEDIUM,
        forceFresh,
      );
      return data.results || [];
    },
    [buildUrl, safeFetch],
  );

  const fetchTrendingAnime = useCallback(
    async (forceFresh = false): Promise<TMDBMediaItem[]> => {
      const data = await safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl("/discover/tv", {
          with_genres: 16,
          with_keywords: 210024,
          sort_by: "popularity.desc",
        }),
        CACHE_TTL.MEDIUM,
        forceFresh,
      );
      return data.results || [];
    },
    [buildUrl, safeFetch],
  );

  const fetchPopularMovies = useCallback(
    async (
      params: Record<string, string | number | boolean | undefined> = {},
    ): Promise<TMDBListResponse<TMDBMediaItem>> => {
      return safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl("/movie/popular", { language: "en-US", page: 1, ...params }),
        CACHE_TTL.MEDIUM,
      );
    },
    [buildUrl, safeFetch],
  );

  const fetchDiscoverMovies = useCallback(
    async (
      params: Record<string, string | number | boolean | undefined> = {},
    ): Promise<TMDBListResponse<TMDBMediaItem>> => {
      return safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl("/discover/movie", {
          sort_by: "popularity.desc",
          include_adult: false,
          include_video: false,
          language: "en-US",
          page: 1,
          ...params,
        }),
        CACHE_TTL.MEDIUM,
      );
    },
    [buildUrl, safeFetch],
  );

  const fetchDiscoverTV = useCallback(
    async (
      params: Record<string, string | number | boolean | undefined> = {},
    ): Promise<TMDBListResponse<TMDBMediaItem>> => {
      return safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl("/discover/tv", {
          sort_by: "popularity.desc",
          include_adult: false,
          include_null_first_air_dates: false,
          language: "en-US",
          page: 1,
          ...params,
        }),
        CACHE_TTL.MEDIUM,
      );
    },
    [buildUrl, safeFetch],
  );

  const searchTMDB = useCallback(
    async (query: string): Promise<TMDBMediaItem[]> => {
      if (!query.trim()) return [];
      const data = await safeFetch<TMDBListResponse<TMDBMediaItem>>(
        buildUrl("/search/multi", {
          query: query.trim(),
          include_adult: false,
          language: "en-US",
        }),
        CACHE_TTL.SHORT,
      );
      return (data.results || []).filter(
        (item) => item.media_type === "movie" || item.media_type === "tv",
      );
    },
    [buildUrl, safeFetch],
  );

  const fetchDetails = useCallback(
    async (type: MediaType, id: number | string): Promise<TMDBMediaItem> => {
      return safeFetch<TMDBMediaItem>(buildUrl(`/${type}/${id}`), CACHE_TTL.LONG);
    },
    [buildUrl, safeFetch],
  );

  const fetchCredits = useCallback(
    async (type: MediaType, id: number | string): Promise<string[]> => {
      try {
        const data = await safeFetch<{ cast?: { name: string }[] }>(
          buildUrl(`/${type}/${id}/credits`),
          CACHE_TTL.LONG,
        );
        return (data.cast || []).slice(0, 5).map((actor) => actor.name);
      } catch {
        return [];
      }
    },
    [buildUrl, safeFetch],
  );

  const fetchVideos = useCallback(
    async (type: MediaType, id: number | string): Promise<VideoResult[]> => {
      try {
        const data = await safeFetch<{ results?: VideoResult[] }>(
          buildUrl(`/${type}/${id}/videos`),
          CACHE_TTL.LONG,
        );
        return (data.results || []).filter((v) => v.site === "YouTube");
      } catch {
        return [];
      }
    },
    [buildUrl, safeFetch],
  );

  const fetchSeasonEpisodes = useCallback(
    async (tvId: number | string, seasonNumber: number): Promise<TVEpisode[]> => {
      const data = await safeFetch<{ episodes?: TVEpisode[] }>(
        buildUrl(`/tv/${tvId}/season/${seasonNumber}`),
        CACHE_TTL.LONG,
      );
      return data.episodes || [];
    },
    [buildUrl, safeFetch],
  );

  const fetchRecommendations = useCallback(
    async (type: MediaType, id: number | string): Promise<TMDBMediaItem[]> => {
      try {
        const data = await safeFetch<TMDBListResponse<TMDBMediaItem>>(
          buildUrl(`/${type}/${id}/recommendations`),
          CACHE_TTL.LONG,
        );
        return data.results || [];
      } catch {
        return [];
      }
    },
    [buildUrl, safeFetch],
  );

  return useMemo(
    () => ({
      movieGenres,
      tvGenres,
      apiStatus,
      fetchNowPlaying,
      fetchTrending,
      fetchTrendingAnime,
      fetchPopularMovies,
      fetchDiscoverMovies,
      fetchDiscoverTV,
      searchTMDB,
      fetchDetails,
      fetchCredits,
      fetchVideos,
      fetchSeasonEpisodes,
      fetchRecommendations,
      clearApiCache,
    }),
    [
      apiStatus,
      fetchCredits,
      fetchDetails,
      fetchDiscoverMovies,
      fetchDiscoverTV,
      fetchNowPlaying,
      fetchPopularMovies,
      fetchRecommendations,
      fetchSeasonEpisodes,
      fetchTrending,
      fetchTrendingAnime,
      fetchVideos,
      movieGenres,
      searchTMDB,
      tvGenres,
    ],
  );
}
