import { NextResponse } from "next/server";
import { reseed } from "@/lib/seed";
import { driver } from "@/lib/db";

export const dynamic = "force-dynamic";
// seeding writes ~1,700 rows; the default 10s function limit is not enough
export const maxDuration = 60;

/**
 * Seed the demo roster into whichever database is configured.
 *
 * Locally SQLite seeds itself on first render, so this exists for Postgres:
 * after applying the migrations, call it once to populate Supabase.
 *
 *   curl -X POST https://<app>/api/seed -H "x-seed-token: $SEED_TOKEN"
 *
 * Guarded by a shared secret and disabled entirely when SEED_TOKEN is unset,
 * because it wipes and rewrites every table.
 */
export async function POST(req: Request) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "SEED_TOKEN is not configured; seeding is disabled" }, { status: 403 });
  }
  if (req.headers.get("x-seed-token") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const started = Date.now();
  await reseed();
  return NextResponse.json({ ok: true, driver, ms: Date.now() - started });
}
