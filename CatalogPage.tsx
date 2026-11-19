import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { MediaRow } from "../components/MediaRow";
import { DetailModal, type DetailModalItem } from "../components/DetailModal";
import { useTMDB } from "../hooks/useTMDB";
import { extractGenreNames } from "../utils/catalogLogic";
import type { LibraryEntry, TMDBMediaItem } from "../types/media";

interface CatalogPageProps {
  mode: "movies" | "tv" | "popular";
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ mode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<TMDBMediaItem[]>([]);
  const [totalPages, setTotalPages] = useState(500);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<DetailModalItem | null>(null);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const year = searchParams.get("year") || "";
  const genre = searchParams.get("genre") || "";
  const minRating = searchParams.get("rating") || "";
  const lang = searchParams.get("lang") || "";
  const sortBy = searchParams.get("sort") || "popularity.desc";

  const {
    movieGenres,
    tvGenres,
    fetchDiscoverMovies,
    fetchDiscoverTV,
    fetchPopularMovies,
    fetchCredits,
  } = useTMDB();

  const genreMap = mode === "tv" ? tvGenres : movieGenres;

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== "page") {
      next.set("page", "1");
    }
    setSearchParams(next);
  };

  const resetFilters = () => {
    setSearchParams({});
  };

  const loadCatalog = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        with_genres: genre || undefined,
        "vote_average.gte": minRating || undefined,
        with_original_language: lang || undefined,
      };

      let data;
      const hasPopularFilters = Boolean(genre || year || minRating || lang);
      if (mode === "popular" && !hasPopularFilters) {
        data = await fetchPopularMovies({ page });
      } else if (mode === "tv") {
        params.sort_by = sortBy;
        if (year) params.first_air_date_year = year;
        data = await fetchDiscoverTV(params);
      } else {
        params.sort_by = mode === "popular" ? "popularity.desc" : sortBy;
        if (year) params.primary_release_year = year;
        data = await fetchDiscoverMovies(params);
      }

      if (!isActive()) return;
      const tagged = (data.results || []).map((entry) => ({
        ...entry,
        media_type: mode === "tv" ? ("tv" as const) : ("movie" as const),
      }));
      setItems(tagged);
      setTotalPages(Math.min(data.total_pages || 300, 500));
    } catch {
      if (isActive()) setErrorMsg("Could not load catalog items from TMDB.");
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [
    fetchDiscoverMovies,
    fetchDiscoverTV,
    fetchPopularMovies,
    genre,
    lang,
    minRating,
    mode,
    page,
    sortBy,
    year,
  ]);

  useEffect(() => {
    let active = true;
    void loadCatalog(() => active);
    return () => {
      active = false;
    };
  }, [loadCatalog]);

  const handleSelectItem = async (item: TMDBMediaItem | LibraryEntry) => {
    const mediaType = mode === "tv" ? "tv" : "movie";
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

  const titleMap = {
    movies: "Movies Catalog",
    tv: "TV Shows Catalog",
    popular: "Popular Movies",
  };
  const subtitleMap = {
    movies: "Filter feature films by release year, genre, rating, language, and sort order.",
    tv: "Discover episodic series and anime indexed from TMDB.",
    popular: "Worldwide trending and popular feature releases.",
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1969 }, (_, i) => currentYear - i);
  const hasActiveFilters = Boolean(
    year || genre || minRating || lang || sortBy !== "popularity.desc",
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-10 sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/[0.08] pb-6">
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
            {titleMap[mode]}
          </h1>
          <p className="text-sm text-slate-400">{subtitleMap[mode]}</p>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-white/10 bg-white/[0.05] px-4 text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Filters
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div
        className={`grid grid-cols-1 gap-4 rounded-xl border border-white/[0.08] bg-[#12141d] p-4 sm:grid-cols-2 ${
          mode === "popular" ? "lg:grid-cols-4" : "lg:grid-cols-5"
        }`}
      >
        <div className="space-y-1.5">
          <label htmlFor="catalog-genre" className="block text-xs font-medium text-slate-400">
            Genre
          </label>
          <select
            id="catalog-genre"
            value={genre}
            onChange={(e) => updateFilter("genre", e.target.value)}
            className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
          >
            <option value="">All Genres</option>
            {Array.from(genreMap.entries()).map(([gid, gname]) => (
              <option key={gid} value={gid}>
                {gname}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="catalog-year" className="block text-xs font-medium text-slate-400">
            Release Year
          </label>
          <select
            id="catalog-year"
            value={year}
            onChange={(e) => updateFilter("year", e.target.value)}
            className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="catalog-rating" className="block text-xs font-medium text-slate-400">
            Minimum Rating
          </label>
          <select
            id="catalog-rating"
            value={minRating}
            onChange={(e) => updateFilter("rating", e.target.value)}
            className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
          >
            <option value="">Any Rating</option>
            <option value="8">8.0+ Exceptional</option>
            <option value="7">7.0+ Great</option>
            <option value="6">6.0+ Good</option>
            <option value="5">5.0+ Average</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="catalog-lang" className="block text-xs font-medium text-slate-400">
            Original Language
          </label>
          <select
            id="catalog-lang"
            value={lang}
            onChange={(e) => updateFilter("lang", e.target.value)}
            className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
          >
            <option value="">All Languages</option>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
          </select>
        </div>

        {mode !== "popular" && (
          <div className="space-y-1.5">
            <label htmlFor="catalog-sort" className="block text-xs font-medium text-slate-400">
              Sort Order
            </label>
            <select
              id="catalog-sort"
              value={sortBy}
              onChange={(e) => updateFilter("sort", e.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
            >
              <option value="popularity.desc">Popularity (High to Low)</option>
              <option value="popularity.asc">Popularity (Low to High)</option>
              <option value="vote_average.desc">Rating (Highest First)</option>
              <option value="vote_average.asc">Rating (Lowest First)</option>
              <option
                value={
                  mode === "tv" ? "first_air_date.desc" : "primary_release_date.desc"
                }
              >
                Release Date (Newest)
              </option>
              <option
                value={
                  mode === "tv" ? "first_air_date.asc" : "primary_release_date.asc"
                }
              >
                Release Date (Oldest)
              </option>
              {mode === "movies" && (
                <option value="revenue.desc">Revenue (Highest)</option>
              )}
              <option value={mode === "tv" ? "name.asc" : "title.asc"}>
                Title (A – Z)
              </option>
            </select>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div key={idx} className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl border border-white/10 bg-[#12141d] p-8 text-center">
          <p className="text-sm text-rose-400">{errorMsg}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#12141d] p-10 text-center space-y-3">
          <p className="text-base font-medium text-white">No titles match these filters.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <MediaRow
            title={`Results (Page ${page})`}
            items={items}
            onSelectItem={handleSelectItem}
            layout="grid"
            genreMap={genreMap}
          />

          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                updateFilter("page", String(page - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-[#12141d] px-4 text-sm font-medium text-slate-200 disabled:opacity-40 hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span>Previous</span>
            </button>

            <span className="text-sm text-slate-400 tabular-nums">
              Page <strong className="text-white">{page}</strong> of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                updateFilter("page", String(page + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-[#12141d] px-4 text-sm font-medium text-slate-200 disabled:opacity-40 hover:bg-white/10"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
};
