/**
 * Simple in-memory IP rate limiter with optional failed-only accounting (for brute-force protection).
 */
export function createRateLimiter({
  windowMs = 60_000,
  max = 30,
  code = 'RATE_LIMITED',
  message = 'Trop de tentatives. Réessayez plus tard.',
  onlyFailed = false,
} = {}) {
  const hits = new Map();

  function pruneExpired(now) {
    if (hits.size < 500) return;
    for (const [key, entry] of hits.entries()) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    pruneExpired(now);

    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    if (entry.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: { code, message, retryAfterSec },
      });
    }

    if (onlyFailed) {
      res.on('finish', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          const cur = hits.get(ip);
          if (cur && Date.now() <= cur.resetAt) {
            cur.count += 1;
          } else {
            hits.set(ip, { count: 1, resetAt: Date.now() + windowMs });
          }
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          hits.delete(ip);
        }
      });
    } else {
      entry.count += 1;
    }

    return next();
  };
}
