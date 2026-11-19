import React from "react";
import { Film, Star, Tv } from "lucide-react";
import {
  formatRating,
  getMediaTitle,
  getMediaYear,
  getPosterUrl,
} from "../utils/catalogLogic";
import type { TMDBMediaItem } from "../types/media";

interface TrendingSidebarProps {
  trendingMovies: TMDBMediaItem[];
  trendingTV: TMDBMediaItem[];
  timeWindow: "week" | "day";
  onSelectItem: (item: TMDBMediaItem) => void;
}

export const TrendingSidebar: React.FC<TrendingSidebarProps> = ({
  trendingMovies,
  trendingTV,
  timeWindow,
  onSelectItem,
}) => {
  const topMovies = trendingMovies.slice(0, 5);
  const topTV = trendingTV.slice(0, 5);

  if (topMovies.length === 0 && topTV.length === 0) return null;

  const periodLabel = timeWindow === "day" ? "Today" : "This Week";

  const renderColumn = (
    heading: string,
    items: TMDBMediaItem[],
    fallbackType: "movie" | "tv",
  ) => (
    <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#12141d] p-5">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <h3 className="font-display text-lg font-bold text-white">{heading}</h3>
        <span className="text-xs font-medium text-slate-400">{periodLabel}</span>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {items.map((item, idx) => {
          const title = getMediaTitle(item);
          const year = getMediaYear(item);
          const rating = formatRating(item.vote_average);
          const poster = getPosterUrl(item.poster_path, true);
          const taggedItem: TMDBMediaItem = {
            ...item,
            media_type: item.media_type || fallbackType,
          };

          return (
            <li key={`${fallbackType}-top-${item.id}`}>
              <button
                type="button"
                onClick={() => onSelectItem(taggedItem)}
                className="flex w-full items-center gap-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.03] rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-rose-500"
              >
                <span className="w-6 shrink-0 font-mono text-sm font-bold text-rose-400 tabular-nums">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {poster ? (
                  <img
                    src={poster}
                    alt={title}
                    referrerPolicy="no-referrer"
                    className="h-12 w-8 shrink-0 rounded object-cover bg-[#191c28]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-[#191c28] text-slate-500">
                    {fallbackType === "tv" ? (
                      <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Film className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                      {rating}
                    </span>
                    {year && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{year}</span>
                      </>
                    )}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section aria-label="Top 5 trending charts" className="space-y-4">
      <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
        Top 5 Charts ({periodLabel})
      </h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {renderColumn("Top Trending Movies", topMovies, "movie")}
        {renderColumn("Top Trending TV Shows", topTV, "tv")}
      </div>
    </section>
  );
};
