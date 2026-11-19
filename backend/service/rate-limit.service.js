const buckets = new Map();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, key = (req) => req.ip || req.socket?.remoteAddress || "unknown" } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 2000) {
      for (const [entry, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(entry);
    }
    const id = String(key(req));
    const current = buckets.get(id);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(id, bucket);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: "Too many attempts. Wait a little and try again." });
    }
    next();
  };
}

module.exports = { rateLimit };
