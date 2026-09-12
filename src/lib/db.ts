import postgres from "postgres";

/**
 * Postgres data layer.
 *
 * This used to be dual-driver, with SQLite behind it for local development —
 * written on day one when there was no database yet. Once Supabase existed the
 * second driver only bought a zero-setup `pnpm dev`, and cost a second schema
 * that had to be kept in step by hand with every migration. Two schemas drift.
 *
 * Tests still need no database and no network: tests/postgres.test.mjs runs
 * against PGlite, which is real Postgres compiled to WASM, so the thing being
 * tested is the same dialect that runs in production.
 *
 * Queries use `?` placeholders, rewritten to `$n`. Timestamps are generated in
 * JS rather than with now(), so a row's time is the application's time and the
 * same value can be written to several rows in one operation.
 */

const CONNECTION_HELP =
  "DATABASE_URL is not set. Copy .env.example to .env.local and add your Supabase " +
  "transaction pooler connection string (port 6543). See SETUP.md.";

export function nowISO(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function uid(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

type PgSql = {
  unsafe: (sql: string, params: unknown[]) => Promise<unknown[]>;
  end: () => Promise<void>;
};

let _pg: PgSql | null = null;

function pg(): PgSql {
  if (_pg) return _pg;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(CONNECTION_HELP);

  const passthrough = (oid: number) => ({
    to: oid,
    from: [oid],
    serialize: (x: unknown) => x as string,
    parse: (x: string) => x,
  });

  _pg = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements
    prepare: false,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    // Keep dates and timestamps as strings. Everything downstream compares ISO
    // strings, and a Date object here would mean two representations of the
    // same column depending on how it was read.
    types: {
      date: passthrough(1082),
      timestamp: passthrough(1114),
      timestamptz: passthrough(1184),
    },
  } as never) as unknown as PgSql;
  return _pg;
}

/** `?` placeholders -> `$1..$n`. */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => "$" + ++i);
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pg().unsafe(toPgPlaceholders(sql), params)) as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function exec(sql: string, params: unknown[] = []): Promise<void> {
  await pg().unsafe(toPgPlaceholders(sql), params);
}

/** True when a connection string is configured. Used to degrade gracefully. */
export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Multi-row INSERT in chunks.
 *
 * Seeding and calendar sync insert on the order of a thousand rows. One
 * statement per row costs one network round trip per row — the first Supabase
 * seed took 192s that way, against 14s batched.
 */
export async function insertMany(
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 250,
): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = columns.join(", ");
  const tuple = "(" + columns.map(() => "?").join(",") + ")";
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await exec(
      "INSERT INTO " + table + " (" + cols + ") VALUES " + chunk.map(() => tuple).join(","),
      chunk.flat(),
    );
    written += chunk.length;
  }
  return written;
}

/** Chunked `DELETE ... WHERE id IN (...)`. */
export async function deleteByIds(table: string, ids: string[], chunkSize = 500): Promise<void> {
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await exec("DELETE FROM " + table + " WHERE id IN (" + chunk.map(() => "?").join(",") + ")", chunk);
  }
}
