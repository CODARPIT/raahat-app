// Small in-memory rate limiter (fixed window per key). It slows down abuse of the
// public endpoints and passcode guessing on one server instance; a production
// deployment would back it with Redis so limits hold across instances.

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export interface RateResult {
  ok: boolean;
  /** Seconds until the caller may try again (0 when ok). */
  retryAfter: number;
}

export function createLimiter(limit: Limit, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>();
  return function check(key: string): RateResult {
    const t = now();
    let h = hits.get(key);
    if (!h || t - h.start >= limit.windowMs) {
      h = { start: t, count: 0 };
      hits.set(key, h);
    }
    h.count++;
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (t - v.start >= limit.windowMs) hits.delete(k);
    }
    if (h.count <= limit.max) return { ok: true, retryAfter: 0 };
    return { ok: false, retryAfter: Math.ceil((h.start + limit.windowMs - t) / 1000) };
  };
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export function tooMany(retryAfter: number, message = "Too many requests. Please wait a moment and try again.") {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}
