import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  Film,
  Play,
  Star,
  Video,
  X,
} from "lucide-react";
import { useSync } from "../context/SyncContext";
import { useTMDB } from "../hooks/useTMDB";
import {
  extractGenreNames,
  formatRating,
  getMediaTitle,
  getMediaYear,
  getPosterUrl,
  resolveMediaType,
} from "../utils/catalogLogic";
import type { LibraryEntry, TMDBMediaItem } from "../types/media";

export type DetailModalItem = (TMDBMediaItem | LibraryEntry) & {
  cast?: string;
  resolvedGenres?: string[];
};

interface DetailModalProps {
  item: DetailModalItem;
  onClose: () => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ item, onClose }) => {
  const navigate = useNavigate();
  const { isInLibrary, toggleLibrary } = useSync();
  const { fetchVideos } = useTMDB();
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);

  const mediaType = resolveMediaType(item);
  const title = getMediaTitle(item);
  const year = getMediaYear(item);
  const rating = formatRating(item.vote_average);
  const posterUrl = getPosterUrl(item.poster_path);
  const inLib = isInLibrary(item.id, mediaType);
  const genres = item.resolvedGenres || extractGenreNames(item);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setShowTrailer(false);
    setTrailerKey(null);
    fetchVideos(mediaType, item.id).then((videos) => {
      if (!active) return;
      const trailer =
        videos.find((v) => v.type === "Trailer" && v.official) ||
        videos.find((v) => v.type === "Trailer") ||
        videos[0];
      if (trailer?.key) {
        setTrailerKey(trailer.key);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchVideos, item.id, mediaType]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#12141d] p-5 sm:p-7 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close title details"
          className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {showTrailer && trailerKey ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between pr-12">
              <h2 id="detail-modal-title" className="font-display text-xl font-bold text-white">
                {title} — Trailer
              </h2>
              <button
                type="button"
                onClick={() => setShowTrailer(false)}
                className="text-sm font-medium text-rose-400 hover:text-rose-300"
              >
                Back to overview
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`}
                title={`${title} Trailer`}
                className="h-full w-full"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="mx-auto w-44 sm:w-52 shrink-0">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={`${title} poster`}
                  referrerPolicy="no-referrer"
                  className="aspect-[2/3] w-full rounded-xl border border-white/10 object-cover bg-[#191c28]"
                />
              ) : (
                <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#191c28] p-4 text-center">
                  <Film className="h-8 w-8 text-slate-500" aria-hidden="true" />
                  <span className="text-xs font-medium text-slate-300">{title}</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4 pr-6">
              <div>
                <h2
                  id="detail-modal-title"
                  className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance"
                >
                  {title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300 tabular-nums">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                    <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                    {rating} / 10
                  </span>
                  {year && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{year}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{mediaType === "tv" ? "TV Series" : "Movie"}</span>
                </div>
                {genres.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    {genres.join(" · ")}
                  </p>
                )}
              </div>

              <p className="text-sm leading-relaxed text-slate-300">
                {item.overview || "No overview available for this title."}
              </p>

              {"cast" in item && item.cast && item.cast !== "N/A" && (
                <p className="text-xs leading-relaxed text-slate-400">
                  <strong className="font-semibold text-slate-200">Cast: </strong>
                  {item.cast}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/watch?type=${mediaType}&id=${item.id}`);
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Watch Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleLibrary(item)}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 whitespace-nowrap"
                >
                  {inLib ? (
                    <>
                      <BookmarkCheck className="h-4 w-4 text-rose-400" aria-hidden="true" />
                      <span>In Library</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" aria-hidden="true" />
                      <span>Add to Library</span>
                    </>
                  )}
                </button>

                {trailerKey && (
                  <button
                    type="button"
                    onClick={() => setShowTrailer(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-transparent px-4 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap"
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    <span>Trailer</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
