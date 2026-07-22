/**
 * Lightweight cache with localStorage persistence + request deduplication.
 *
 * - Stores data in both memory AND localStorage so returning users see
 *   cached data instantly while fresh data loads in background.
 * - `inflight` deduplicates concurrent callers so N callers share one request.
 * - On error, serves stale cache for graceful degradation.
 *
 * Usage:
 *   const data = await requestCache('dashboard.trending.US', () => api.get(...), 60_000)
 */

const LS_PREFIX = 'finsight_cache_'
const store = new Map<string, { data: unknown; expiresAt: number }>()
const inflight = new Map<string, Promise<unknown>>()

/** Read from localStorage */
function readLS<T>(key: string): { data: T; expiresAt: number } | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Write to localStorage */
function writeLS(key: string, data: unknown, expiresAt: number) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data, expiresAt }))
  } catch {
    // Storage full — clear old entries
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(LS_PREFIX)) localStorage.removeItem(k)
      }
    } catch {}
  }
}

/** Return cached data from memory or localStorage, or null */
function getCached<T>(key: string): T | null {
  // 1) In-memory (fastest)
  const mem = store.get(key)
  if (mem && Date.now() < mem.expiresAt) return mem.data as T
  // 2) localStorage (survives page refresh)
  const ls = readLS<T>(key)
  if (ls && Date.now() < ls.expiresAt) {
    // Promote to memory
    store.set(key, ls)
    return ls.data as T
  }
  return null
}

export async function requestCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  // Serve from cache if fresh
  const cached = getCached<T>(key)
  if (cached !== null) return cached

  // Deduplicate concurrent callers
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fetcher()
    .then((data) => {
      const expiresAt = Date.now() + ttlMs
      store.set(key, { data, expiresAt })
      writeLS(key, data, expiresAt)
      inflight.delete(key)
      return data
    })
    .catch((err) => {
      inflight.delete(key)
      // On error, keep stale cache if available (graceful degradation)
      const stale = store.get(key) || readLS<T>(key)
      if (stale && stale.data !== undefined) return stale.data as T
      throw err
    })

  inflight.set(key, promise)
  return promise
}

/** Return stale cache immediately (for optimistic UI) or null */
export function getStaleCache<T>(key: string): T | null {
  const mem = store.get(key)
  if (mem) return mem.data as T
  const ls = readLS<T>(key)
  if (ls) return ls.data as T
  return null
}

/** Force-expire a specific key */
export function invalidateCache(key: string) {
  store.delete(key)
}

/** Force-expire all keys matching a prefix (e.g. 'dashboard.') */
export function invalidateCacheByPrefix(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Clear everything */
export function clearCache() {
  store.clear()
  inflight.clear()
}
