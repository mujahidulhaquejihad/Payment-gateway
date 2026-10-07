// ponytail: in-memory sliding window, per process only. Move to Redis/Postgres when running more than one instance.
const hits = new Map<string, number[]>();
const MAX_KEYS = 50_000;
const MAX_WINDOW_MS = 60 * 60_000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Bound memory under a flood of distinct keys (spoofed IPs, random emails).
  if (hits.size > MAX_KEYS) for (const [k, ts] of hits) if (now - ts[ts.length - 1] > MAX_WINDOW_MS) hits.delete(k);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  hits.set(key, recent);
  return allowed;
}

/**
 * Client IP as recorded by our reverse proxy: `x-real-ip`, else the last `x-forwarded-for` hop.
 * The first XFF entry is whatever the client sent, so it is never used. Deploy behind a proxy that sets these.
 */
export function ipFrom(get: (name: string) => string | null | undefined): string {
  return get("x-real-ip")?.trim() || get("x-forwarded-for")?.split(",").at(-1)?.trim() || "127.0.0.1";
}
