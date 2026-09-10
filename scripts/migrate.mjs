/**
 * Apply supabase/migrations/*.sql to whatever DATABASE_URL points at.
 *
 *   node --env-file=.env.local tests/migrate.mjs
 *
 * Every migration is written to be re-runnable, so this is safe to repeat.
 * Reads the connection string from the environment and never prints it.
 */
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Load it with --env-file=.env.local");
  process.exit(1);
}

const host = new URL(url).hostname;
console.log("connecting to " + host + " ...");

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20, idle_timeout: 10 });

try {
  const [{ version }] = await sql`select version()`;
  console.log("connected: " + version.split(",")[0]);

  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".sql")) continue;
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write("  applying " + file + " ... ");
    await sql.unsafe(text);
    console.log("ok");
  }

  const tables = await sql`
    select c.relname, c.relrowsecurity,
           (select count(*) from information_schema.columns
             where table_schema='public' and table_name=c.relname) as cols
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r'
     order by c.relname`;
  console.log("\ntables now in public:");
  for (const t of tables) {
    console.log("  " + t.relname.padEnd(10) + " " + String(t.cols).padStart(2) + " cols  RLS=" + t.relrowsecurity);
  }
} catch (e) {
  console.error("\nFAILED: " + e.message);
  if (e.code) console.error("code: " + e.code);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
