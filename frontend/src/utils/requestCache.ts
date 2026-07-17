/**
 * Lightweight in-memory cache + request deduplication for API data.
 *
 * - `cache` stores resolved values with a TTL so subsequent reads skip the network.
 * - `inflight` deduplicates in-flight promises so N concurrent callers share one
 *   request instead of firing N requests.
 *
 * Usage:
 *   const data = await requestCache('dashboard.trending.US', () => api.get(...), 60_000)
 */

const store = new Map<string, { data: unknown; expiresAt: number }>()
const inflight = new Map<string, Promise<unknown>>()

export async function requestCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const cached = store.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data as T
  }

  // Deduplicate concurrent callers
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fetcher()
    .then((data) => {
      store.set(key, { data, expiresAt: Date.now() + ttlMs })
      inflight.delete(key)
      return data
    })
    .catch((err) => {
      inflight.delete(key)
      // On error, keep stale cache if available (graceful degradation)
      const stale = store.get(key)
      if (stale) return stale.data as T
      throw err
    })

  inflight.set(key, promise)
  return promise
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
