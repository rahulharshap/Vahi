/**
 * Membership, invitations, seat limits and tenant isolation, against a real
 * database.
 *
 * These rules decide who can see whose client list, and they are not
 * expressible as a database constraint — they live in joinFirm(). The unit
 * suites cannot reach them because src/lib/auth.ts imports next/headers, so
 * this harness copies the library, rewrites the specifiers plain Node cannot
 * resolve, and calls the real functions.
 *
 *   node --env-file=.env.local scripts/verify-membership.mjs
 *
 * It writes to whatever DATABASE_URL points at and cleans up after itself.
 * Do not point it at a database holding real client data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vahi-verify-"));
const libDir = path.join(tmp, "lib");
fs.mkdirSync(libDir);

for (const file of fs.readdirSync(path.join(root, "src/lib"))) {
  if (!file.endsWith(".ts")) continue;
  const src = fs
    .readFileSync(path.join(root, "src/lib", file), "utf8")
    // Node needs explicit extensions on relative imports; Next does not
    .replace(/from "(\.\/[A-Za-z0-9_]+)"/g, 'from "$1.ts"')
    // and the bare specifiers Next resolves have to point at real entry files
    .replace(/from "next\/headers"/g, 'from "next/headers.js"')
    .replace(/from "@supabase\/ssr"/g, 'from "@supabase/ssr/dist/main/index.js"');
  fs.writeFileSync(path.join(libDir, file), src);
}
// so bare specifiers resolve against the project's installed packages
fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"), "junction");

const load = (name) => import(pathToFileURL(path.join(libDir, name)).href);
const { q, exec } = await load("db.ts");
const { joinFirm, inviteToFirm, seatUsage, membershipFor } = await load("auth.ts");
const { createFirm, setMaxMembers } = await load("tenant.ts");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "  OK   " : "  FAIL ") + name + (detail ? " -> " + detail : ""));
  ok ? pass++ : fail++;
};
const uuid = (n) => `0000000${n}-0000-0000-0000-00000000000${n}`;

async function cleanup() {
  await exec("DELETE FROM memberships");
  await exec("DELETE FROM invitations");
  await exec("DELETE FROM auth.users WHERE email LIKE '%@qa.local'");
  await exec("DELETE FROM firms WHERE name LIKE 'QA %'");
}

await cleanup();
for (let i = 1; i <= 4; i++) {
  await exec("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT DO NOTHING", [
    uuid(i),
    `u${i}@qa.local`,
  ]);
}

console.log("--- bootstrap ---");
const m1 = await joinFirm(uuid(1), "u1@qa.local", "First Person");
check("first ever signup becomes owner of the existing firm", m1?.role === "owner", m1?.role ?? "null");

console.log("");
console.log("--- the door closes behind them ---");
const m2 = await joinFirm(uuid(2), "u2@qa.local");
check("a second signup with no invitation gets nothing", m2 === null, m2 ? m2.role : "null");

console.log("");
console.log("--- invitations ---");
await inviteToFirm(m1.firm_id, "u2@qa.local", "staff", "qa");
const m2b = await joinFirm(uuid(2), "u2@qa.local", "Second Person");
check("an invited user joins with the invited role", m2b?.role === "staff", m2b?.role ?? "null");
check("and joins the inviting firm", m2b?.firm_id === m1.firm_id);
const claimed = await q("SELECT COUNT(*) n FROM invitations WHERE claimed_at IS NOT NULL");
check("the invitation is marked claimed", Number(claimed[0].n) === 1);

console.log("");
console.log("--- seat limits ---");
await setMaxMembers(m1.firm_id, 2);
const usage = await seatUsage(m1.firm_id);
check(
  "two members against a limit of two reads as full",
  usage.used === 2 && usage.free === 0,
  JSON.stringify(usage),
);

let blocked = false;
try {
  await inviteToFirm(m1.firm_id, "u3@qa.local", "staff", "qa");
} catch {
  blocked = true;
}
check("inviting past the cap is refused", blocked);

// the authoritative case: an invitation issued while a seat was free, then
// claimed after the last seat has gone
await setMaxMembers(m1.firm_id, 3);
await inviteToFirm(m1.firm_id, "u3@qa.local", "staff", "qa");
await setMaxMembers(m1.firm_id, 2);
const m3 = await joinFirm(uuid(3), "u3@qa.local");
check("a stale invitation cannot be claimed once the cap is reached", m3 === null, m3 ? m3.role : "null");

await setMaxMembers(m1.firm_id, null);
const m3b = await joinFirm(uuid(3), "u3@qa.local");
check("raising the limit lets the same invitation through", m3b?.role === "staff", m3b?.role ?? "null");

console.log("");
console.log("--- tenant isolation ---");
const firmB = await createFirm({ name: "QA Second Practice", city: "Chennai" });
await inviteToFirm(firmB, "u4@qa.local", "owner", "qa");
const m4 = await joinFirm(uuid(4), "u4@qa.local");
check("a user invited to the second firm joins that firm", m4?.firm_id === firmB, m4?.firm_id ?? "null");
check("and is not a member of the first", (await membershipFor(uuid(4)))?.firm_id !== m1.firm_id);

const perFirm = await q("SELECT firm_id, COUNT(*) n FROM memberships GROUP BY firm_id ORDER BY firm_id");
check(
  "memberships are partitioned by firm",
  perFirm.length === 2,
  perFirm.map((r) => r.firm_id + "=" + r.n).join(", "),
);

await cleanup();
fs.rmSync(tmp, { recursive: true, force: true });

console.log("");
console.log("=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
