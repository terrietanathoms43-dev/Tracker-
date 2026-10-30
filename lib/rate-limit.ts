// In-memory sliding-window rate limiting, for the endpoints better-auth's limiter does not reach:
// auth.api calls made server-side (signInWithEmail) bypass it entirely, and the invitation batch is
// an email-spam vector worth its own cap. One pm2 process keeps one counter; a restart clears it.
// The caller chooses the key — an IP, an email, a user id — so every bucket is scoped by who it names.

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/**
 * Records one hit for `key`. Returns true when the window is already full and the caller should refuse.
 * `now` is injectable so the windowing is unit-tested without a clock.
 */
export function rateLimitHit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (bucket === undefined) buckets.set(key, (bucket = { hits: [] }));
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= max) return true;
  bucket.hits.push(now);
  // Periodic sweep so keys whose owners went away do not accumulate.
  if (now - lastSweep > windowMs * 4) {
    for (const [k, b] of buckets) if (b.hits.length === 0 || b.hits[b.hits.length - 1] <= cutoff) buckets.delete(k);
    lastSweep = now;
  }
  return false;
}
