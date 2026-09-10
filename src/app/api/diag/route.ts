import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { driver } from "@/lib/db";
import { addDays, clientSummaries, dashboard, listFilings, todayISO } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Where does a request actually spend its time?
 *
 * Measuring from a laptop conflates network latency, cold starts, connection
 * setup, query time and render time. This runs inside the deployed function
 * and reports each separately. Returns timings and row counts only — no
 * connection details, no client data.
 */
export async function GET() {
  const t: Record<string, number> = {};
  const mark = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const s = performance.now();
    const r = await fn();
    t[name] = Math.round(performance.now() - s);
    return r;
  };

  // First query on a fresh instance pays TLS + auth to the pooler; the second
  // reuses the connection, so the gap between them is connection setup.
  await mark("first_query_incl_connect", () => q("SELECT 1 AS ok"));
  await mark("second_query_warm", () => q("SELECT 1 AS ok"));

  const today = todayISO();
  const board = await mark("dashboard()", () => dashboard());
  const roster = await mark("clientSummaries()", () => clientSummaries());
  const cal = await mark("calendar listFilings()", () =>
    listFilings({ from: addDays(today, -60), to: addDays(today, 90), openOnly: true }),
  );

  return NextResponse.json({
    driver,
    region: process.env.VERCEL_REGION ?? "local",
    coldStart: !globalThis.__vahiWarm,
    ms: t,
    rows: {
      dashboardTotal: Object.values(board.buckets).reduce((s, b) => s + b.length, 0),
      overdue: board.buckets.OVERDUE.length,
      onTrack: board.buckets.ON_TRACK.length,
      clients: roster.length,
      calendar: cal.length,
    },
  });
}

declare global {
  var __vahiWarm: boolean | undefined;
}
globalThis.__vahiWarm = true;
