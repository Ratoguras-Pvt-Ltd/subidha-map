/**
 * Sliding-window rate limiter.
 *
 * ponytail: in-memory Map, no Redis. On Vercel each serverless instance keeps its
 * own counters, so a determined attacker spread across many cold starts gets more
 * attempts than the nominal limit — enough to blunt credential stuffing, not enough
 * to call it a hard guarantee. Swap in Upstash Redis if brute-force pressure
 * becomes real; the call signature stays the same.
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

// Bound the map so a flood of distinct keys can't grow it without limit.
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the window frees up. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (buckets.size > MAX_KEYS) buckets.clear();

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return { ok: true, remaining: limit - bucket.hits.length, retryAfter: 0 };
}

/** Five login attempts per email+IP per 10 minutes. */
export const LOGIN_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

/** Generous enough for real editing, tight enough to stop a runaway script. */
export const MUTATION_LIMIT = { limit: 60, windowMs: 60 * 1000 };

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
