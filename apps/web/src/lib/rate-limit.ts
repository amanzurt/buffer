// In-memory sliding window rate limiter. Suitable for single-process VPS deploy.
// Each key tracks an array of request timestamps within the window.

const windows = new Map<string, number[]>();

// Prune old windows every 5 minutes to avoid unbounded memory growth.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, timestamps] of windows.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) windows.delete(key);
      else windows.set(key, fresh);
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key      Unique identifier (e.g. "create-post:workspaceId")
 * @param max      Maximum requests allowed in the window
 * @param windowMs Window duration in milliseconds
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (windows.get(key) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  windows.set(key, timestamps);
  return true;
}
