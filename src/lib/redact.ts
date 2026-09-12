/**
 * Redaction for log lines.
 *
 * Kept in its own module with no imports, for two reasons: it is pure and
 * therefore directly testable, and the thing it protects — credentials never
 * reaching a log collector — is worth testing without spinning up half the app
 * to do it.
 */

/** Field names whose values must never reach a log line. */
const REDACT_KEYS = /^(password|token|secret|key|authorization|apikey|api_key|database_url)$/i;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    // connection strings and bearer tokens turn up inside error messages,
    // where no field name protects them
    return value
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
      .replace(/\bvahi_[A-Za-z0-9_-]{8,}/g, "vahi_[redacted]");
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.test(k) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Clamp a caller-supplied limit into something the database can serve. */
export function limitFrom(params: URLSearchParams, fallback = 50, max = 500): number {
  const raw = Number(params.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}
