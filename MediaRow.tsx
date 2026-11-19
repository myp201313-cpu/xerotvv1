import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard } from "./MediaCard";
import type { LibraryEntry, TMDBMediaItem } from "../types/media";

interface MediaRowProps {
  title: string;
  items: (TMDBMediaItem | LibraryEntry)[];
  onSelectItem: (item: TMDBMediaItem | LibraryEntry) => void;
  layout?: "row" | "grid";
  exploreTo?: string;
  exploreLabel?: string;
  genreMap?: Map<number, string>;
}

export const MediaRow: React.FC<MediaRowProps> = ({
  title,
  items,
  onSelectItem,
  layout = "row",
  exploreTo,
  exploreLabel = "View all",
  genreMap,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!items || items.length === 0) return null;

  const scrollByAmount = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const delta = direction === "left" ? -640 : 640;
    scrollRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
            {title}
          </h2>
          {exploreTo && (
            <Link
              to={exploreTo}
              className="text-xs sm:text-sm font-medium text-rose-400 hover:text-rose-300 transition-colors whitespace-nowrap"
            >
              {exploreLabel} →
            </Link>
          )}
        </div>

        {layout === "row" && (
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollByAmount("left")}
              aria-label={`Scroll ${title} left`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#12141d] text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount("right")}
              aria-label={`Scroll ${title} right`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#12141d] text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {layout === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <MediaCard
              key={`${item.media_type || "item"}-${item.id}`}
              item={item}
              onSelect={onSelectItem}
              genreMap={genreMap}
            />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="cinema-scroll flex gap-4 overflow-x-auto pb-3"
        >
          {items.map((item) => (
            <div
              key={`${item.media_type || "item"}-${item.id}`}
              className="w-[155px] sm:w-[180px] md:w-[196px] shrink-0"
            >
              <MediaCard
                item={item}
                onSelect={onSelectItem}
                genreMap={genreMap}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
