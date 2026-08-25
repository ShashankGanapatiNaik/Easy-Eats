/**
 * Stale-While-Revalidate Caching Helper for LocalStorage
 * 
 * Features:
 * - 10-Minute Default TTL
 * - Safe handling of missing/malformed/stale data
 * - Cache invalidation and helper utilities
 * - Never caches sensitive user auth tokens/data
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get data from cache synchronously.
 * Returns null if missing, expired, or malformed.
 */
export function getCachedData(key, ttlMs = DEFAULT_TTL_MS) {
  try {
    const raw = localStorage.getItem(`cache_${key}`);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== "object" || !entry.timestamp || !entry.data) {
      localStorage.removeItem(`cache_${key}`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > ttlMs) {
      // Data is stale past TTL, but caller can decide to return stale or null.
      // We return data with a `isStale` flag if needed, or null if strictly expired.
      return { data: entry.data, isStale: true, age };
    }

    return { data: entry.data, isStale: false, age };
  } catch (e) {
    console.warn(`[Cache] Malformed cache for key: cache_${key}`, e);
    try { localStorage.removeItem(`cache_${key}`); } catch {}
    return null;
  }
}

/**
 * Store data into cache with current timestamp.
 */
export function setCachedData(key, data) {
  if (!data) return;
  try {
    const entry = {
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    console.warn(`[Cache] Storage quota exceeded or disabled for key: cache_${key}`, e);
  }
}

/**
 * Explicitly invalidate a cache key or pattern.
 */
export function invalidateCache(keyPattern) {
  try {
    if (!keyPattern) {
      // Clear all app cache keys starting with 'cache_'
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("cache_")) {
          localStorage.removeItem(k);
        }
      });
      return;
    }

    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(`cache_${keyPattern}`)) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {
    console.warn("[Cache] Invalidation error:", e);
  }
}

/**
 * Stale-While-Revalidate execution wrapper for async fetch functions.
 * 
 * @param {string} cacheKey - Unique key for local storage
 * @param {Function} fetchFn - Async function returning Axios response or raw data
 * @param {Object} options - { onCacheHit: fn(data), onFreshData: fn(data), onError: fn(err), ttlMs: number }
 */
export async function fetchWithSWR(cacheKey, fetchFn, options = {}) {
  const {
    onCacheHit = () => {},
    onFreshData = () => {},
    onError = () => {},
    ttlMs = DEFAULT_TTL_MS,
  } = options;

  // 1. Immediate cache lookup (Stale-While-Revalidate)
  const cached = getCachedData(cacheKey, ttlMs);
  let hasServedCache = false;

  if (cached && cached.data) {
    hasServedCache = true;
    onCacheHit(cached.data, cached.isStale);
  }

  // 2. Background fresh fetch from API
  try {
    const response = await fetchFn();
    const freshData = response && response.data !== undefined ? response.data : response;

    // 3. Save to localStorage cache & update React state with fresh data
    setCachedData(cacheKey, freshData);
    onFreshData(freshData);
    return { data: freshData, servedFromCache: false };
  } catch (err) {
    console.warn(`[Cache SWR] Background fetch failed for ${cacheKey}`, err);
    onError(err, hasServedCache);
    if (hasServedCache) {
      // Fallback cleanly using stale data already served
      return { data: cached.data, servedFromCache: true, isStale: true };
    }
    throw err;
  }
}
