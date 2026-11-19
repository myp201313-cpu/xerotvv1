export type MediaType = "movie" | "tv";

export interface GenreItem {
  id: number;
  name: string;
}

export interface TMDBMediaItem {
  id: number;
  media_type?: MediaType | "person";
  type?: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: (string | GenreItem)[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TVSeason[];
  status?: string;
  tagline?: string;
  imdb_id?: string;
  external_ids?: {
    imdb_id?: string | null;
  };
}

export interface TVSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string;
  poster_path?: string | null;
}

export interface TVEpisode {
  id: number;
  name: string;
  overview?: string;
  episode_number: number;
  season_number: number;
  runtime?: number;
  air_date?: string;
  still_path?: string | null;
  vote_average?: number;
}

export interface VideoResult {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
}

export interface LibraryEntry {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  overview: string;
  genres: string[];
  addedAt: number;
}

export interface WatchHistoryEntry {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  season?: number;
  episode?: number;
  serverIndex: number;
  watchedAt: number;
  progressPercent: number;
}

export interface SyncPreferences {
  preferredServerIndex: number;
  sandboxDefault: boolean;
  autoSyncEnabled: boolean;
  region: string;
  language: string;
}

export interface SyncVaultPayload {
  syncKey: string;
  deviceId: string;
  library: LibraryEntry[];
  history: WatchHistoryEntry[];
  preferences: SyncPreferences;
  lastCatalogSyncAt: number | null;
  updatedAt: number;
}

export interface StreamingServer {
  id: string;
  name: string;
  providerLabel: string;
  defaultSandbox: boolean;
  sandboxVerified: boolean;
  recommended?: boolean;
  enabled?: boolean;
  qualityHint: string;
}

export interface SyncRoomState {
  roomCode: string;
  mediaType: MediaType;
  mediaId: number;
  title: string;
  season: number;
  episode: number;
  serverIndex: number;
  updatedBy: string;
  updatedAt: number;
}

export interface RealDownloadItem {
  id: string;
  provider: string;
  label: string;
  quality: string;
  format: string;
  sizeLabel?: string;
  language: string;
  url: string;
  isDirectFile: boolean;
}

export interface SubtitleDownloadItem {
  id: string;
  language: string;
  format: string;
  url: string;
}

export interface MediaDownloadResponse {
  mediaType: MediaType;
  tmdbId: string;
  season?: number;
  episode?: number;
  downloads: RealDownloadItem[];
  subtitles: SubtitleDownloadItem[];
  disabled?: boolean;
  checkedAt: number;
}

export interface AdminServerOverride {
  enabled: boolean;
  recommended: boolean;
  order: number;
}

export interface AdminConfig {
  defaultServerId: string;
  enforceSandbox: boolean;
  downloadsEnabled: boolean;
  roomsEnabled: boolean;
  catalogAutoSync: boolean;
  announcement: string;
  tmdbCacheTtlMinutes: number;
  serverOverrides: Record<string, AdminServerOverride>;
  updatedAt: number;
}

export interface RuntimeConfig {
  servers: StreamingServer[];
  defaultServerId: string;
  enforceSandbox: boolean;
  downloadsEnabled: boolean;
  roomsEnabled: boolean;
  catalogAutoSync: boolean;
  announcement: string;
}
