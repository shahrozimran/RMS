interface RateLimitEntry {
  timestamps: number[]
}

const cache = new Map<string, RateLimitEntry>()

/**
 * Sliding window IP rate limiter.
 * Tracks timestamps of requests from a specific key (IP + endpoint).
 */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const entry = cache.get(key)

  if (!entry) {
    cache.set(key, { timestamps: [now] })
    return false
  }

  // Filter out timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)

  if (entry.timestamps.length >= limit) {
    return true
  }

  entry.timestamps.push(now)
  cache.set(key, entry)
  return false
}

// Automatically prune empty keys from memory every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of cache.entries()) {
      entry.timestamps = entry.timestamps.filter(t => now - t < 10 * 60 * 1000) // Keep last 10m
      if (entry.timestamps.length === 0) {
        cache.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}
