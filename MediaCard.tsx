import React, { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Film, Play, Star } from "lucide-react";
import { useSync } from "../context/SyncContext";
import {
  formatRating,
  getMediaTitle,
  getMediaYear,
  getPosterUrl,
  resolveMediaType,
} from "../utils/catalogLogic";
import type { LibraryEntry, TMDBMediaItem } from "../types/media";

interface MediaCardProps {
  item: TMDBMediaItem | LibraryEntry;
  onSelect: (item: TMDBMediaItem | LibraryEntry) => void;
  genreMap?: Map<number, string>;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onSelect,
  genreMap,
}) => {
  const [imgError, setImgError] = useState(false);
  const { isInLibrary, toggleLibrary } = useSync();

  const mediaType = resolveMediaType(item);
  const title = getMediaTitle(item);
  const year = getMediaYear(item);
  const rating = formatRating(item.vote_average);
  const posterUrl = getPosterUrl(item.poster_path);
  const inLib = isInLibrary(item.id, mediaType);

  useEffect(() => {
    setImgError(false);
  }, [posterUrl]);

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#12141d]">
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="block h-full w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          aria-label={`View details for ${title}`}
        >
          {posterUrl && !imgError ? (
            <img
              src={posterUrl}
              alt={`${title} poster`}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#191c28] to-[#0d0f17] p-4 text-center">
              <Film className="h-7 w-7 text-slate-500" aria-hidden="true" />
              <span className="line-clamp-3 text-xs font-medium text-slate-300">
                {title}
              </span>
            </div>
          )}

          {/* Subtle hover scrim */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <span>Watch</span>
          </div>
        </button>

        {/* Independent Bookmark Action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleLibrary(item, genreMap);
          }}
          aria-label={inLib ? `Remove ${title} from Library` : `Save ${title} to Library`}
          title={inLib ? "Remove from Library" : "Save to Library"}
          className={`absolute top-2.5 right-2.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-rose-500 ${
            inLib
              ? "border-rose-500/60 bg-rose-600 text-white"
              : "border-white/15 bg-black/65 text-slate-200 hover:bg-black/85 hover:text-white"
          }`}
        >
          {inLib ? (
            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Bookmark className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="mt-2.5 space-y-1 px-0.5">
        <h3 className="truncate text-sm font-semibold text-slate-100" title={title}>
          {title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
          <span className="inline-flex items-center gap-1 font-medium text-amber-400">
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            {rating}
          </span>
          {year && (
            <>
              <span aria-hidden="true">·</span>
              <span>{year}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{mediaType === "tv" ? "TV" : "Movie"}</span>
        </div>
      </div>
    </article>
  );
};
