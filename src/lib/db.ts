import path from "node:path";
import fs from "node:fs";
import postgres from "postgres";

/**
 * Dual-driver data layer.
 *
 *   DATABASE_URL set  -> Postgres (Supabase). Used in production.
 *   DATABASE_URL unset -> SQLite via Node's built-in driver. Used locally, so
 *                         the app runs with no external service and no native
 *                         build step.
 *
 * Both paths speak the same SQL subset. Queries use `?` placeholders and are
 * rewritten to `$n` for Postgres. Timestamps are generated in JS rather than
 * with `datetime('now')` / `now()` so the SQL stays dialect-neutral. Booleans
 * are passed as JS booleans and coerced to 0/1 for SQLite.
 *
 * The Postgres schema lives in supabase/migrations/0001_init.sql and must be
 * kept in step with SQLITE_SCHEMA below.
 *
 * `node:sqlite` is imported lazily and only on the SQLite path. It is behind
 * --experimental-sqlite until Node 23.4, so a static import crashes on
 * Node 22 — which is what most hosts, Vercel included, still default to —
 * even for a deployment that only ever talks to Postgres.
 */

export type Driver = "postgres" | "sqlite";

export const driver: Driver = process.env.DATABASE_URL ? "postgres" : "sqlite";

export function nowISO(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function uid(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// --------------------------------------------------------------- sqlite path

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "vahi.db");

export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS firms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id             TEXT PRIMARY KEY,
  firm_id        TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  pan            TEXT,
  gstin          TEXT,
  gst_scheme     TEXT NOT NULL DEFAULT 'NONE',
  tds_deductor   INTEGER NOT NULL DEFAULT 0,
  has_employees  INTEGER NOT NULL DEFAULT 0,
  tax_audit      INTEGER NOT NULL DEFAULT 0,
  director_count INTEGER NOT NULL DEFAULT 0,
  state          TEXT NOT NULL DEFAULT 'Telangana',
  contact_name   TEXT,
  contact_phone  TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_firm ON clients(firm_id);

CREATE TABLE IF NOT EXISTS filings (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  obligation_code TEXT NOT NULL,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,
  authority       TEXT NOT NULL,
  period_key      TEXT NOT NULL,
  period_label    TEXT NOT NULL,
  due_date        TEXT NOT NULL,
  extended_due    TEXT,
  status          TEXT NOT NULL DEFAULT 'AWAITING_DOCS',
  docs_required   TEXT NOT NULL DEFAULT '[]',
  docs_received   TEXT NOT NULL DEFAULT '[]',
  penalty_note    TEXT,
  assignee        TEXT,
  filed_at        TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (client_id, obligation_code, period_key)
);
CREATE INDEX IF NOT EXISTS idx_filings_due ON filings(due_date);
CREATE INDEX IF NOT EXISTS idx_filings_client ON filings(client_id);
CREATE INDEX IF NOT EXISTS idx_filings_status ON filings(status);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  filing_id  TEXT NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'WHATSAPP',
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'QUEUED',
  sent_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_filing ON messages(filing_id);

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  firm_id       TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  filing_id     TEXT REFERENCES filings(id) ON DELETE SET NULL,
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  doc_label     TEXT,
  file_name     TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER,
  storage_path  TEXT,
  source        TEXT NOT NULL DEFAULT 'EMAIL',
  from_address  TEXT,
  subject       TEXT,
  matched_by    TEXT,
  received_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_filing ON documents(filing_id);
CREATE INDEX IF NOT EXISTS idx_documents_firm_received ON documents(firm_id, received_at DESC);
`;

/**
 * Additive column changes for an existing local database.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and a developer who has been
 * running the app should not have to delete their database to pick up a new
 * field. Each statement is attempted and a duplicate-column error ignored.
 * Postgres gets the same changes through supabase/migrations.
 */
const SQLITE_ALTERS = [
  "ALTER TABLE clients ADD COLUMN email TEXT",
  "ALTER TABLE clients ADD COLUMN channel TEXT NOT NULL DEFAULT 'WHATSAPP'",
];

type SqliteHandle = {
  prepare: (sql: string) => { all: (...p: unknown[]) => unknown[]; run: (...p: unknown[]) => unknown };
  exec: (sql: string) => void;
};

let _sqlite: SqliteHandle | null = null;

async function sqlite(): Promise<SqliteHandle> {
  if (_sqlite) return _sqlite;
  let DatabaseSync: new (p: string) => unknown;
  try {
    ({ DatabaseSync } = (await import("node:sqlite")) as unknown as {
      DatabaseSync: new (p: string) => unknown;
    });
  } catch {
    throw new Error(
      "node:sqlite is unavailable on this Node build. Set DATABASE_URL to use " +
        "Postgres, or run Node 23.4+ (or Node 22 with --experimental-sqlite).",
    );
  }
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const handle = new DatabaseSync(DB_PATH) as SqliteHandle;
  handle.exec("PRAGMA journal_mode = WAL;");
  handle.exec("PRAGMA foreign_keys = ON;");
  handle.exec(SQLITE_SCHEMA);
  for (const stmt of SQLITE_ALTERS) {
    try {
      handle.exec(stmt);
    } catch {
      // column already present
    }
  }
  _sqlite = handle;
  return handle;
}

/** SQLite has no boolean type and rejects JS booleans outright. */
function forSqlite(params: unknown[]): unknown[] {
  return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p === undefined ? null : p));
}

// ------------------------------------------------------------- postgres path

type PgSql = {
  unsafe: (sql: string, params: unknown[]) => Promise<unknown[]>;
  end: () => Promise<void>;
};

let _pg: PgSql | null = null;

function pg(): PgSql {
  if (_pg) return _pg;
  const passthrough = (oid: number) => ({
    to: oid,
    from: [oid],
    serialize: (x: unknown) => x as string,
    parse: (x: string) => x,
  });
  _pg = postgres(process.env.DATABASE_URL!, {
    // Supabase's transaction pooler does not support prepared statements
    prepare: false,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    // Keep dates and timestamps as strings so both drivers hand the app the
    // same shape. Everything downstream compares ISO strings.
    types: {
      date: passthrough(1082),
      timestamp: passthrough(1114),
      timestamptz: passthrough(1184),
    },
  } as never) as unknown as PgSql;
  return _pg;
}

/** `?` placeholders -> `$1..$n`, leaving `??` (none used) and literals alone. */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => "$" + ++i);
}

// -------------------------------------------------------------------- public

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (driver === "postgres") {
    return (await pg().unsafe(toPgPlaceholders(sql), params)) as T[];
  }
  return (await sqlite()).prepare(sql).all(...forSqlite(params)) as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await q<T>(sql, params);
  return rows[0];
}

export async function exec(sql: string, params: unknown[] = []): Promise<void> {
  if (driver === "postgres") {
    await pg().unsafe(toPgPlaceholders(sql), params);
    return;
  }
  (await sqlite()).prepare(sql).run(...forSqlite(params));
}

/** Postgres schema is applied by migration; SQLite builds itself on first use. */
export async function ensureSchema(): Promise<void> {
  if (driver === "sqlite") await sqlite();
}

/**
 * Multi-row INSERT in chunks.
 *
 * Seeding and calendar sync insert on the order of a thousand rows. One
 * statement per row costs one network round trip per row, which is invisible
 * against local SQLite and catastrophic against a pooled database in another
 * city — the first Supabase seed took 192s this way.
 */
export async function insertMany(
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 250,
): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = columns.join(", ");
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const tuple = "(" + columns.map(() => "?").join(",") + ")";
    const sql =
      "INSERT INTO " + table + " (" + cols + ") VALUES " + chunk.map(() => tuple).join(",");
    await exec(sql, chunk.flat());
    written += chunk.length;
  }
  return written;
}

/** Chunked `DELETE ... WHERE id IN (...)`. */
export async function deleteByIds(table: string, ids: string[], chunkSize = 500): Promise<void> {
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await exec(
      "DELETE FROM " + table + " WHERE id IN (" + chunk.map(() => "?").join(",") + ")",
      chunk,
    );
  }
}
