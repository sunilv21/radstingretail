/**
 * Tiny in-memory rate limiter. Single-process Phase 1 only — when we move to
 * a clustered deploy this should be swapped for a Redis-backed sliding window.
 *
 * Usage:
 *   router.post('/login', rateLimit({ key: 'login', limit: 5, windowMs: 15*60_000 }), handler);
 *
 * Key strategy: IP + email (so one attacker can't lock out a victim's account
 * by spamming from many IPs, and one IP can't try many accounts in parallel).
 */
import { AppError } from '../utils/response.js';

const buckets = new Map(); // key -> { count, resetAt }

// Periodically drop expired buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
}, 60_000).unref?.();

export function rateLimit({ key, limit, windowMs, identify }) {
  return (req, _res, next) => {
    const ident = identify
      ? identify(req)
      : `${req.ip}:${(req.body?.email || '').toLowerCase()}`;
    const bucketKey = `${key}:${ident}`;
    const now = Date.now();
    let entry = buckets.get(bucketKey);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    buckets.set(bucketKey, entry);
    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return next(
        new AppError(
          'TOO_MANY_ATTEMPTS',
          `Too many attempts. Try again in ${retryAfter}s.`,
          429,
          { retryAfter },
        ),
      );
    }
    next();
  };
}
