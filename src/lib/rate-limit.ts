import "server-only";

// Lightweight in-memory fixed-window rate limiter. No Redis/external store —
// this app runs as a single Node process (see README's "Going online later"),
// so a Map is sufficient and avoids adding infra for a school-scale deployment.
// Deliberately generous everywhere it's applied: the goal is to blunt scripted
// brute-force/abuse, not to add friction to normal classroom use.
//
// NOTE: resets on process restart/redeploy, and isn't shared across multiple
// instances. Fine for this app's single-instance deployment model; revisit if
// that ever changes.
const buckets = new Map<string, { count: number; resetAt: number }>();

// Trim occasionally so long-running processes don't leak memory from
// one-off keys (e.g. per-email login attempts) that are never checked again.
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

// `key` should already include whatever scope matters (e.g. `login:${email}`
// or `practice-ai:${studentId}`). `max` requests are allowed per `windowMs`.
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  sweep();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}
