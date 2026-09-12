import { exec, uid, nowISO } from "./db";
import { scrub } from "./redact";
import { currentActor, currentFirmId } from "./tenant";

/**
 * Two kinds of record, deliberately separate.
 *
 * Logs are for operators: one JSON line per event, to stdout, where Vercel and
 * every other host already collect them. Ephemeral, high volume, no schema
 * guarantees.
 *
 * The audit trail is for the firm: durable rows saying who changed what and
 * when. A CA may need to show, eighteen months later, when a return was marked
 * filed and on whose instruction. That cannot live in a log that rotates.
 *
 * Neither is allowed to fail a request. A write that cannot be recorded is
 * worth knowing about, but not at the cost of the work the user asked for.
 */

export type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = {
    t: new Date().toISOString(),
    level,
    event,
    ...(scrub(fields) as Record<string, unknown>),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => log("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => log("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => log("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => log("error", event, fields),
};

/** Time an operation and log how long it took. */
export async function timed<T>(event: string, fn: () => Promise<T>, fields: Record<string, unknown> = {}): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    logger.info(event, { ...fields, ms: Math.round(performance.now() - started) });
    return result;
  } catch (e) {
    logger.error(event + ".failed", {
      ...fields,
      ms: Math.round(performance.now() - started),
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

// ----------------------------------------------------------------- audit

export interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  detail?: string | Record<string, unknown>;
}

/**
 * Record a change against the firm. Never throws: an audit write that fails
 * is logged loudly, but the user's action still succeeded and pretending
 * otherwise would be a lie.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const firmId = await currentFirmId();
    const { actor, actorKind } = currentActor();
    const detail =
      typeof entry.detail === "string" ? entry.detail : entry.detail ? JSON.stringify(scrub(entry.detail)) : null;
    await exec(
      `INSERT INTO audit_log (id, firm_id, actor, actor_kind, action, entity, entity_id, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [uid("aud"), firmId, actor, actorKind, entry.action, entry.entity ?? null, entry.entityId ?? null, detail, nowISO()],
    );
    logger.info("audit", { action: entry.action, entity: entry.entity, entityId: entry.entityId, actor });
  } catch (e) {
    logger.error("audit.failed", {
      action: entry.action,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function recentAudit(firmId: string, limit = 100) {
  const { q } = await import("./db");
  return q<{
    id: string;
    actor: string;
    actor_kind: string;
    action: string;
    entity: string | null;
    entity_id: string | null;
    detail: string | null;
    created_at: string;
  }>(
    `SELECT id, actor, actor_kind, action, entity, entity_id, detail, created_at
       FROM audit_log WHERE firm_id = ? ORDER BY created_at DESC LIMIT ?`,
    [firmId, limit],
  );
}
