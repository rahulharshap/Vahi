import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

/**
 * Single-file SQLite via Node's built-in driver. No native build step, no
 * external service. The schema is deliberately Postgres-shaped so moving to
 * Supabase later is a dialect change, not a redesign.
 */

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "vahi.db");

let _db: DatabaseSync | null = null;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS firms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clients_firm ON clients(firm_id);

-- One row per (client, obligation, period). Regenerated idempotently.
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
  -- set when CBDT/CBIC extends a deadline; overrides due_date everywhere
  extended_due    TEXT,
  status          TEXT NOT NULL DEFAULT 'AWAITING_DOCS',
  docs_required   TEXT NOT NULL DEFAULT '[]',
  docs_received   TEXT NOT NULL DEFAULT '[]',
  penalty_note    TEXT,
  assignee        TEXT,
  filed_at        TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, obligation_code, period_key)
);
CREATE INDEX IF NOT EXISTS idx_filings_due ON filings(due_date);
CREATE INDEX IF NOT EXISTS idx_filings_client ON filings(client_id);
CREATE INDEX IF NOT EXISTS idx_filings_status ON filings(status);

-- Every chase we send to a client, and what came back.
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  filing_id  TEXT NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'WHATSAPP',
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'QUEUED',
  sent_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_filing ON messages(filing_id);
`;

export function db(): DatabaseSync {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const handle = new DatabaseSync(DB_PATH);
  handle.exec("PRAGMA journal_mode = WAL;");
  handle.exec("PRAGMA foreign_keys = ON;");
  handle.exec(SCHEMA);
  _db = handle;
  return handle;
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return db()
    .prepare(sql)
    .all(...(params as never[])) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return db()
    .prepare(sql)
    .get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  return db()
    .prepare(sql)
    .run(...(params as never[]));
}

export function uid(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
