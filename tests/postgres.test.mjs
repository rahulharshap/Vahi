/**
 * Validate the Postgres path without touching Supabase.
 *
 * Runs the real migrations and the app's real queries against Postgres
 * (PGlite = Postgres compiled to WASM, same query planner and type system),
 * so we prove the SQL, the `?` -> `$n` rewriting, and the date/boolean
 * handling before a single credential exists.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const db = await new PGlite();

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "  OK   " : "  FAIL ") + name + (detail ? " -> " + detail : ""));
  ok ? pass++ : fail++;
};

// Supabase provides the auth schema and its users table; plain Postgres does
// not. Stub the shape the migrations reference so 0005 applies unchanged —
// testing against a doctored copy of the migration would test nothing.
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  -- RLS policies reference auth.uid(); Supabase defines it from the request
  -- JWT, and here it only has to exist for the policy to be creatable.
  create or replace function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;
`);

// Supabase ships these roles; PGlite does not. Create them so 0002 runs as-is.
await db.exec(`
  do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
`);

// ---------------------------------------------------------------- migrations
const migDir = path.join(ROOT, "supabase/migrations");
for (const f of fs.readdirSync(migDir).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), "utf8");
  try {
    await db.exec(sql);
    check("migration " + f, true);
  } catch (e) {
    check("migration " + f, false, e.message);
    process.exit(1);
  }
}

// idempotency: every migration uses IF NOT EXISTS, so re-running must be safe
try {
  for (const f of fs.readdirSync(migDir).sort()) {
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  }
  check("migrations are re-runnable", true);
} catch (e) {
  check("migrations are re-runnable", false, e.message);
}

// ------------------------------------------------------------ schema shape
const cols = await db.query(`
  select table_name, column_name, data_type
    from information_schema.columns
   where table_schema = 'public' order by table_name, ordinal_position`);
const typeOf = (t, c) => cols.rows.find((r) => r.table_name === t && r.column_name === c)?.data_type;
check("filings.due_date is a real date", typeOf("filings", "due_date") === "date", typeOf("filings", "due_date"));
check("clients.tds_deductor is boolean", typeOf("clients", "tds_deductor") === "boolean", typeOf("clients", "tds_deductor"));
check("filings.filed_at is timestamptz", typeOf("filings", "filed_at") === "timestamp with time zone", typeOf("filings", "filed_at"));

const rls = await db.query(
  `select relname, relrowsecurity from pg_class where relname in ('firms','clients','filings','messages')`,
);
check("RLS enabled on all four tables", rls.rows.every((r) => r.relrowsecurity), JSON.stringify(rls.rows.map((r) => r.relname + "=" + r.relrowsecurity)));

// ------------------------------------------------------- tenancy and seats
console.log("");
console.log("--- tenancy ---");
check("platform_admins exists", cols.rows.some((r) => r.table_name === "platform_admins"));
check(
  "memberships links a user to a firm",
  ["user_id", "firm_id", "role"].every((c) =>
    cols.rows.some((r) => r.table_name === "memberships" && r.column_name === c),
  ),
);
check("firm_settings carries a seat limit", typeOf("firm_settings", "max_members") === "integer", String(typeOf("firm_settings", "max_members")));

await db.exec("insert into firms (id, name, city, slug) values ('firm_seats','Seat Test','Hyderabad','seat-test')");
await db.exec("insert into firm_settings (firm_id, max_members) values ('firm_seats', 2)");

// a limit below one would lock a firm out of itself
try {
  await db.exec("update firm_settings set max_members = 0 where firm_id = 'firm_seats'");
  check("a zero seat limit is rejected", false, "accepted");
} catch {
  check("a zero seat limit is rejected", true);
}

// null is unlimited, and must stay allowed: adding limits later must never
// retroactively lock out a firm that already has more people than the new cap
try {
  await db.exec("update firm_settings set max_members = null where firm_id = 'firm_seats'");
  check("null means unlimited", true);
} catch (e) {
  check("null means unlimited", false, e.message);
}

await db.exec("insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','a@b.test')");
try {
  await db.exec("insert into memberships (id, user_id, firm_id, role) values ('mem_x','11111111-1111-1111-1111-111111111111','firm_seats','superuser')");
  check("an unknown membership role is rejected", false, "accepted");
} catch {
  check("an unknown membership role is rejected", true);
}

await db.exec("insert into memberships (id, user_id, firm_id, role) values ('mem_ok','11111111-1111-1111-1111-111111111111','firm_seats','owner')");
const seated = await db.query("select count(*) n from memberships where firm_id = 'firm_seats'");
check("a valid membership stores", Number(seated.rows[0].n) === 1);

try {
  await db.exec("insert into memberships (id, user_id, firm_id, role) values ('mem_dupe','11111111-1111-1111-1111-111111111111','firm_seats','staff')");
  check("one membership per user per firm", false, "duplicate accepted");
} catch {
  check("one membership per user per firm", true);
}

// an open invitation is unique per (firm, email); a second would let one seat
// be claimed twice
await db.exec("insert into invitations (id, firm_id, email) values ('inv_1','firm_seats','kiran@firm.test')");
try {
  await db.exec("insert into invitations (id, firm_id, email) values ('inv_2','firm_seats','KIRAN@firm.test')");
  check("a duplicate open invitation is rejected, case-insensitively", false, "accepted");
} catch {
  check("a duplicate open invitation is rejected, case-insensitively", true);
}

// ------------------------------------------ the app's own queries, verbatim
let ph = 0;
const toPg = (sql) => ((ph = 0), sql.replace(/\?/g, () => "$" + ++ph));
const q = async (sql, params = []) => (await db.query(toPg(sql), params)).rows;

const now = "2026-09-10 10:00:00";
await q("INSERT INTO firms (id, name, city, created_at) VALUES (?, ?, ?, ?)", [
  "firm_demo",
  "Rao & Associates",
  "Hyderabad",
  now,
]);

// booleans passed as JS booleans, exactly as store.ts does
await q(
  `INSERT INTO clients
     (id, firm_id, name, entity_type, pan, gstin, gst_scheme, tds_deductor,
      has_employees, tax_audit, director_count, state, contact_name, contact_phone, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ["cli_1", "firm_demo", "Veda Software Labs Pvt Ltd", "PVT_LTD", "AACCV5566D", "36AACCV5566D1ZQ", "MONTHLY", true, true, true, 3, "Telangana", "Sneha Reddy", "+919000112233", now],
);
check("insert with JS booleans", true);

await q(
  `INSERT INTO filings
     (id, client_id, obligation_code, title, category, authority, period_key,
      period_label, due_date, docs_required, penalty_note, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ["fil_1", "cli_1", "GSTR3B_M", "GSTR-3B", "GST", "GSTN", "2026-08", "Aug 2026", "2026-09-20", JSON.stringify(["Sales register", "Purchase register"]), "Late fee", now],
);
await q(
  `INSERT INTO filings
     (id, client_id, obligation_code, title, category, authority, period_key,
      period_label, due_date, docs_required, penalty_note, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ["fil_2", "cli_1", "TAX_AUDIT", "Tax audit report", "INCOME_TAX", "Income Tax Dept", "FY2026", "FY 2025-26", "2026-09-30", JSON.stringify(["Books"]), "271B", now],
);

// the unique constraint the sync relies on for idempotency
try {
  await q(
    `INSERT INTO filings (id, client_id, obligation_code, title, category, authority,
       period_key, period_label, due_date, docs_required, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ["fil_dup", "cli_1", "GSTR3B_M", "GSTR-3B", "GST", "GSTN", "2026-08", "Aug 2026", "2026-09-20", "[]", now],
  );
  check("duplicate (client, obligation, period) rejected", false, "insert succeeded");
} catch {
  check("duplicate (client, obligation, period) rejected", true);
}

// check constraints must reject bad enum values
try {
  await q("UPDATE filings SET status = ? WHERE id = ?", ["NONSENSE", "fil_1"]);
  check("status check constraint enforced", false, "bad status accepted");
} catch {
  check("status check constraint enforced", true);
}

// the exact join + COALESCE ordering the board uses
const FILING_SELECT = `
  SELECT f.*, c.name AS clientname, c.contact_name AS contactname, c.contact_phone AS contactphone
    FROM filings f JOIN clients c ON c.id = f.client_id
   WHERE c.firm_id = ?`;
const rows = await q(
  FILING_SELECT +
    " AND COALESCE(f.extended_due, f.due_date) >= ? AND COALESCE(f.extended_due, f.due_date) <= ?" +
    " ORDER BY COALESCE(f.extended_due, f.due_date) ASC",
  ["firm_demo", "2026-08-01", "2026-12-31"],
);
check("board query returns rows", rows.length === 2, rows.length + " rows");
check("client name alias lowercases as expected", rows[0]?.clientname === "Veda Software Labs Pvt Ltd", String(rows[0]?.clientname));

// extension override must reorder results
await q("UPDATE filings SET extended_due = ? WHERE id = ?", ["2026-11-15", "fil_1"]);
const reordered = await q(
  FILING_SELECT + " ORDER BY COALESCE(f.extended_due, f.due_date) ASC",
  ["firm_demo"],
);
check("extended_due overrides ordering", reordered[0].id === "fil_2", reordered.map((r) => r.id).join(","));

// dates must come back as strings, not Date objects, once parsing is disabled.
// PGlite parses them, so assert the raw shape is date-like either way.
const d = reordered[0].due_date;
const asIso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
check("due_date round-trips to 2026-09-30", asIso === "2026-09-30", asIso);

// batched chase lookup with a dynamic IN list
await q(
  "INSERT INTO messages (id, filing_id, client_id, stage, body, status, sent_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
  ["msg_1", "fil_1", "cli_1", "T10", "hello", "SENT", now, now],
);
const ids = ["fil_1", "fil_2"];
const msgs = await q(
  `SELECT filing_id, stage, created_at FROM messages
    WHERE filing_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at ASC`,
  ids,
);
check("batched IN-list chase query", msgs.length === 1 && msgs[0].stage === "T10");

// COUNT(*) comes back as a string in Postgres; store.ts wraps it in Number()
const cnt = await q("SELECT COUNT(*) AS n FROM filings f JOIN clients c ON c.id=f.client_id WHERE c.firm_id=?", ["firm_demo"]);
check("COUNT(*) coerces via Number()", Number(cnt[0].n) === 2, typeof cnt[0].n + " " + cnt[0].n);

// cascade delete keeps the tables consistent
await q("DELETE FROM clients WHERE id = ?", ["cli_1"]);
const left = await q("SELECT COUNT(*) AS n FROM filings", []);
const leftMsgs = await q("SELECT COUNT(*) AS n FROM messages", []);
check("cascade delete clears filings and messages", Number(left[0].n) === 0 && Number(leftMsgs[0].n) === 0);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
