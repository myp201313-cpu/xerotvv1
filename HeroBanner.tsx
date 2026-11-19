import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  Star,
} from "lucide-react";
import { useSync } from "../context/SyncContext";
import {
  formatRating,
  getBackdropUrl,
  getMediaTitle,
  getMediaYear,
  resolveMediaType,
} from "../utils/catalogLogic";
import type { TMDBMediaItem } from "../types/media";

interface HeroBannerProps {
  items: TMDBMediaItem[];
  onMoreInfo: (item: TMDBMediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ items, onMoreInfo }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const { isInLibrary, toggleLibrary } = useSync();

  const firstItemId = items[0]?.id;
  useEffect(() => {
    setActiveIndex(0);
  }, [firstItemId, items.length]);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [isPaused, items.length]);

  if (!items.length) return null;

  const safeIndex = activeIndex < items.length ? activeIndex : 0;
  const current = items[safeIndex] || items[0];
  const mediaType = resolveMediaType(current);
  const title = getMediaTitle(current);
  const year = getMediaYear(current);
  const rating = formatRating(current.vote_average);
  const backdropUrl = getBackdropUrl(current.backdrop_path);
  const inLib = isInLibrary(current.id, mediaType);

  const prevSlide = () =>
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  const nextSlide = () => setActiveIndex((prev) => (prev + 1) % items.length);

  return (
    <section
      aria-label="Featured releases"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#0b0c12]"
    >
      <div className="relative mx-auto min-h-[470px] sm:min-h-[540px] max-w-[1440px]">
        {/* Backdrop Image */}
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt={title}
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-65 transition-opacity duration-500"
          />
        )}

        {/* Measured Contrast Scrims */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0f] via-[#090a0f]/80 to-[#090a0f]/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/30 to-transparent" />

        {/* Foreground Editorial Content */}
        <div className="relative z-10 flex min-h-[470px] sm:min-h-[540px] flex-col justify-end px-4 pb-10 pt-20 sm:px-8 sm:pb-14">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold tracking-wider text-rose-400">
              Early Access · Now Playing
            </p>

            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-300 tabular-nums">
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
              <span aria-hidden="true">·</span>
              <span>{mediaType === "tv" ? "TV Series" : "Feature Film"}</span>
              <span aria-hidden="true">·</span>
              <span>HD / Multi-Mirror</span>
            </div>

            <p className="line-clamp-3 max-w-xl text-sm sm:text-base leading-relaxed text-slate-300">
              {current.overview || "Stream with live TMDB metadata and multi-server mirror switching."}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to={`/watch?type=${mediaType}&id=${current.id}`}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-500 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Play Now</span>
              </Link>

              <button
                type="button"
                onClick={() => onMoreInfo(current)}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] px-5 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/15 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
                <span>More Info</span>
              </button>

              <button
                type="button"
                onClick={() => toggleLibrary(current)}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-black/40 px-4 text-sm font-medium text-slate-200 transition-colors duration-150 hover:bg-white/10 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
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
            </div>
          </div>

          {/* Minimal Slide Controls */}
          {items.length > 1 && (
            <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4">
              <div className="flex items-center gap-2" role="tablist" aria-label="Featured slides">
                {items.map((slide, idx) => (
                  <button
                    key={slide.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIndex}
                    aria-label={`Show slide ${idx + 1}: ${getMediaTitle(slide)}`}
                    onClick={() => setActiveIndex(idx)}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      idx === activeIndex
                        ? "w-7 bg-rose-500"
                        : "w-2.5 bg-white/25 hover:bg-white/45"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Previous featured title"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-slate-300 hover:border-white/25 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Next featured title"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-slate-300 hover:border-white/25 hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
