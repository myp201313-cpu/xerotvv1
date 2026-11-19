import React, { useEffect, useRef, useState } from "react";
import { Film, Search, Star, X } from "lucide-react";
import { useTMDB } from "../hooks/useTMDB";
import {
  formatRating,
  getMediaTitle,
  getMediaYear,
  getPosterUrl,
  resolveMediaType,
} from "../utils/catalogLogic";
import type { TMDBMediaItem } from "../types/media";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: TMDBMediaItem) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectItem,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { searchTMDB } = useTMDB();

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
      return;
    }
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 20);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHighlightedIndex(-1);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    const timer = setTimeout(async () => {
      try {
        const items = await searchTMDB(trimmed);
        if (!cancelled) {
          const sliced = items.slice(0, 18);
          setResults(sliced);
          setHighlightedIndex(sliced.length > 0 ? 0 : -1);
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Search request failed. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen, searchTMDB]);

  if (!isOpen) return null;

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && results[highlightedIndex]) {
      e.preventDefault();
      onSelectItem(results[highlightedIndex]);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-16 sm:pt-24 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search movies and TV shows"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#12141d] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          <label htmlFor="xerotv-search-input" className="sr-only">
            Search movies, series, and anime
          </label>
          <input
            id="xerotv-search-input"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search movies, TV series, or anime..."
            className="w-full bg-transparent text-base text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3">
          {!query.trim() ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Start typing a title to search the live TMDB catalog.
            </p>
          ) : loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 animate-pulse rounded-xl bg-white/[0.04]"
                />
              ))}
            </div>
          ) : errorMsg ? (
            <p className="py-10 text-center text-sm text-rose-400">{errorMsg}</p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No titles found for "{query}".
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {results.map((item, idx) => {
                const mediaType = resolveMediaType(item);
                const title = getMediaTitle(item);
                const year = getMediaYear(item);
                const rating = formatRating(item.vote_average);
                const poster = getPosterUrl(item.poster_path, true);
                const active = idx === highlightedIndex;

                return (
                  <li key={`${mediaType}-${item.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => {
                        onSelectItem(item);
                        onClose();
                      }}
                      className={`flex w-full items-center gap-3.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-rose-500 ${
                        active ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
                      }`}
                    >
                      {poster ? (
                        <img
                          src={poster}
                          alt={title}
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
                        <p className="truncate text-sm font-semibold text-white">
                          {title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                          <span>{mediaType === "tv" ? "TV Series" : "Movie"}</span>
                          {year && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{year}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                            {rating}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
