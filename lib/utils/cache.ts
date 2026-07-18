interface CacheItem<T> {
  data: T
  expiry: number
}

const memoryCache = new Map<string, CacheItem<any>>()

/**
 * Simple client-side memory cache with TTL (Time To Live).
 */
export const clientCache = {
  /**
   * Set cache item
   * @param key cache key
   * @param data payload
   * @param ttlSeconds cache duration in seconds
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const expiry = Date.now() + ttlSeconds * 1000
    memoryCache.set(key, { data, expiry })
  },

  /**
   * Get cache item. Returns null if expired or missing.
   */
  get<T>(key: string): T | null {
    const item = memoryCache.get(key)
    if (!item) return null

    if (Date.now() > item.expiry) {
      memoryCache.delete(key)
      return null
    }

    return item.data as T
  },

  /**
   * Clear entry
   */
  delete(key: string): void {
    memoryCache.delete(key)
  },

  /**
   * Clear all
   */
  clear(): void {
    memoryCache.clear()
  }
}
