import { NextResponse } from "next/server";
import { firmFromApiKey, runAsFirm, type ApiKeyRow } from "./tenant";
import { logger } from "./log";
import { limitFrom } from "./redact";

export { limitFrom };

/**
 * The API surface.
 *
 * Every handler runs inside a tenant scope derived from the presented key, so
 * a handler cannot accidentally read another firm's rows — it has no way to
 * name a firm at all. Scopes are hierarchical: admin implies write implies
 * read.
 *
 * Errors are shaped consistently because the first consumer of this API is a
 * test suite, and a test that has to guess at an error shape is a test that
 * breaks for the wrong reasons.
 */

export type Scope = ApiKeyRow["scopes"];

const RANK: Record<Scope, number> = { read: 1, write: 2, admin: 3 };

export interface ApiContext {
  firmId: string;
  keyId: string;
  scopes: Scope;
  /** Parsed query string of the request */
  params: URLSearchParams;
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function apiOk(data: unknown, meta?: Record<string, unknown>) {
  return NextResponse.json(meta ? { data, meta } : { data });
}

function presentedKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

/**
 * Wrap a handler with authentication, tenant scoping, timing and logging.
 *
 * Usage:
 *   export const GET = withApi("read", async (req, ctx) => apiOk(...));
 */
export function withApi(
  required: Scope,
  handler: (req: Request, ctx: ApiContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const started = performance.now();
    const url = new URL(req.url);
    const route = url.pathname;

    const key = presentedKey(req);
    if (!key) {
      logger.warn("api.unauthenticated", { route, method: req.method });
      return apiError(401, "missing_key", "Provide an API key as `Authorization: Bearer vahi_…` or `x-api-key`.");
    }

    const resolved = await firmFromApiKey(key);
    if (!resolved) {
      logger.warn("api.bad_key", { route, method: req.method });
      return apiError(401, "invalid_key", "That API key is not recognised, or has been revoked.");
    }

    if (RANK[resolved.scopes] < RANK[required]) {
      logger.warn("api.forbidden", { route, method: req.method, has: resolved.scopes, needs: required });
      return apiError(403, "insufficient_scope", "This key has " + resolved.scopes + " access; " + required + " is required.");
    }

    const ctx: ApiContext = {
      firmId: resolved.firmId,
      keyId: resolved.keyId,
      scopes: resolved.scopes,
      params: url.searchParams,
    };

    try {
      const res = await runAsFirm(
        { firmId: resolved.firmId, actor: resolved.keyId, actorKind: "API" },
        () => handler(req, ctx),
      );
      logger.info("api.request", {
        route,
        method: req.method,
        status: res.status,
        firmId: resolved.firmId,
        keyId: resolved.keyId,
        ms: Math.round(performance.now() - started),
      });
      return res;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("api.request.failed", {
        route,
        method: req.method,
        firmId: resolved.firmId,
        keyId: resolved.keyId,
        ms: Math.round(performance.now() - started),
        message,
      });
      // the message may name a table or a constraint; that is operator
      // information, not caller information
      return apiError(500, "internal_error", "The request could not be completed.");
    }
  };
}

/** Read a JSON body, or return a 400-shaped error. */
export async function jsonBody<T>(req: Request): Promise<{ ok: true; body: T } | { ok: false; res: Response }> {
  try {
    return { ok: true, body: (await req.json()) as T };
  } catch {
    return { ok: false, res: apiError(400, "invalid_json", "Request body must be valid JSON.") };
  }
}

