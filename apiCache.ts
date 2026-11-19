export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000,
  MEDIUM: 20 * 60 * 1000,
  LONG: 60 * 60 * 1000,
  STATIC: 24 * 60 * 60 * 1000,
} as const;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const SESSION_PREFIX = "xerotv_cache_";
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getFromCache<T>(key: string): T | null {
  const now = Date.now();
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    if (!memEntry.expiresAt || memEntry.expiresAt > now) {
      return memEntry.data as T;
    }
    memoryCache.delete(key);
  }

  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (!entry.expiresAt || entry.expiresAt > now) {
        memoryCache.set(key, entry);
        return entry.data;
      }
      sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
    }
  } catch {
    // sessionStorage unavailable or quota exceeded
  }

  return null;
}

export function setToCache<T>(key: string, data: T, ttlMs: number = CACHE_TTL.MEDIUM): void {
  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttlMs,
  };
  memoryCache.set(key, entry);

  try {
    sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Quota limit or private mode
  }
}

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = CACHE_TTL.MEDIUM,
  forceFresh = false,
): Promise<T> {
  if (!forceFresh) {
    const cached = getFromCache<T>(key);
    if (cached !== null) {
      return cached;
    }
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }

  const requestPromise = (async () => {
    try {
      const data = await fetcher();
      if (data !== undefined && data !== null) {
        setToCache(key, data, ttlMs);
      }
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, requestPromise);
  return requestPromise;
}

export function clearApiCache(key?: string): number {
  let cleared = 0;
  if (key) {
    if (memoryCache.delete(key)) cleared += 1;
    try {
      sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
    } catch {
      // ignore
    }
    return cleared;
  }

  cleared = memoryCache.size;
  memoryCache.clear();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
  return cleared;
}

export function getClientCacheCount(): number {
  return memoryCache.size;
}
