import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Play, RefreshCw, Search, Trash2 } from "lucide-react";
import { MediaRow } from "../components/MediaRow";
import { DetailModal, type DetailModalItem } from "../components/DetailModal";
import { useSync } from "../context/SyncContext";
import {
  filterAndSortLibrary,
  getPosterUrl,
  type LibraryFilterType,
  type LibrarySortOrder,
} from "../utils/catalogLogic";

export const LibraryPage: React.FC = () => {
  const {
    vault,
    library,
    history,
    clearLibrary,
    clearHistory,
    removeHistoryItem,
    pushSyncNow,
    syncStatus,
  } = useSync();

  const [tab, setTab] = useState<"saved" | "history">("saved");
  const [filterType, setFilterType] = useState<LibraryFilterType>("all");
  const [sortOrder, setSortOrder] = useState<LibrarySortOrder>("recent");
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DetailModalItem | null>(null);

  const filteredLibrary = useMemo(
    () =>
      filterAndSortLibrary(library, {
        type: filterType,
        query,
        sort: sortOrder,
      }),
    [filterType, library, query, sortOrder],
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-10 sm:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Your Library
          </h1>
          <p className="text-sm text-slate-400 tabular-nums">
            {library.length} saved titles · {history.length} watched · Sync Key{" "}
            <span className="font-mono text-slate-200">
              {vault.syncKey || "Local Only"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void pushSyncNow()}
            disabled={syncStatus === "syncing"}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-4 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncStatus === "syncing" ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{syncStatus === "syncing" ? "Syncing..." : "Sync Vault Now"}</span>
          </button>

          <Link
            to="/sync"
            className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Sync Settings
          </Link>
        </div>
      </div>

      {/* Tabs + Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-lg border border-white/10 bg-[#12141d] p-1 self-start"
          role="tablist"
          aria-label="Library sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "saved"}
            onClick={() => {
              setTab("saved");
              setConfirmClear(false);
            }}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors tabular-nums ${
              tab === "saved" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Saved Titles ({library.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => {
              setTab("history");
              setConfirmClear(false);
            }}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors tabular-nums ${
              tab === "history" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Watch History ({history.length})
          </button>
        </div>

        {((tab === "saved" && library.length > 0) ||
          (tab === "history" && history.length > 0)) && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (tab === "saved") clearLibrary();
                    else clearHistory();
                    setConfirmClear(false);
                  }}
                  className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  Confirm Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-300 hover:bg-white/5"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear {tab === "saved" ? "Library" : "History"}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "saved" ? (
        <>
          {library.length > 0 && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.08] bg-[#12141d] p-4 sm:grid-cols-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
                <label htmlFor="library-search" className="sr-only">
                  Filter saved library
                </label>
                <input
                  id="library-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter saved titles..."
                  className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="library-type-filter" className="sr-only">
                  Media type
                </label>
                <select
                  id="library-type-filter"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as LibraryFilterType)}
                  className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="movie">Movies Only</option>
                  <option value="tv">TV Shows Only</option>
                </select>
              </div>

              <div>
                <label htmlFor="library-sort" className="sr-only">
                  Sort library
                </label>
                <select
                  id="library-sort"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as LibrarySortOrder)}
                  className="h-10 w-full rounded-lg border border-white/10 bg-[#090a0f] px-3 text-sm text-white focus:border-rose-500 focus:outline-none"
                >
                  <option value="recent">Recently Added</option>
                  <option value="rating">Highest Rated</option>
                  <option value="title">Title (A–Z)</option>
                </select>
              </div>
            </div>
          )}

          {library.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#12141d] px-6 py-16 text-center">
              <Bookmark className="h-10 w-10 text-slate-500" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-white">
                  Your library is empty
                </h2>
                <p className="max-w-md text-sm text-slate-400">
                  Bookmark movies or TV shows while browsing, or link an existing Sync Key
                  to pull your saved watchlist from another device.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/movies"
                  className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500"
                >
                  Browse Catalog
                </Link>
                <Link
                  to="/sync"
                  className="inline-flex h-10 items-center rounded-lg border border-white/15 px-5 text-sm font-medium text-slate-200 hover:bg-white/10"
                >
                  Link Sync Key
                </Link>
              </div>
            </div>
          ) : filteredLibrary.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#12141d] p-10 text-center">
              <p className="text-sm text-slate-400">No saved titles match your filter.</p>
            </div>
          ) : (
            <MediaRow
              title="Saved Watchlist"
              items={filteredLibrary}
              onSelectItem={(item) => setSelectedItem(item)}
              layout="grid"
            />
          )}
        </>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#12141d] px-6 py-16 text-center">
          <Play className="h-10 w-10 text-slate-500" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-white">
              No watch history yet
            </h2>
            <p className="max-w-md text-sm text-slate-400">
              Start streaming any movie or episode to track resume checkpoints and mirror
              preferences automatically.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500"
          >
            Explore Releases
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#12141d]">
          {history.map((entry) => {
            const poster = getPosterUrl(entry.poster_path, true);
            const watchHref =
              entry.media_type === "tv"
                ? `/watch?type=tv&id=${entry.id}&season=${entry.season || 1}&episode=${entry.episode || 1}&server=${entry.serverIndex}`
                : `/watch?type=movie&id=${entry.id}&server=${entry.serverIndex}`;

            return (
              <div
                key={`${entry.media_type}-${entry.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-white/[0.03]"
              >
                <Link to={watchHref} className="flex min-w-0 flex-1 items-center gap-4">
                  {poster ? (
                    <img
                      src={poster}
                      alt={entry.title}
                      referrerPolicy="no-referrer"
                      className="h-14 w-10 shrink-0 rounded-md object-cover bg-[#191c28]"
                    />
                  ) : (
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-[#191c28] text-slate-500">
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {entry.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 tabular-nums">
                      {entry.media_type === "tv"
                        ? `Season ${entry.season || 1} · Episode ${entry.episode || 1}`
                        : "Feature Film"}{" "}
                      · Mirror Server {entry.serverIndex + 1} ·{" "}
                      {new Date(entry.watchedAt).toLocaleString()}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={watchHref}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>Resume</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeHistoryItem(entry.id, entry.media_type)}
                    aria-label={`Remove ${entry.title} from watch history`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
};
