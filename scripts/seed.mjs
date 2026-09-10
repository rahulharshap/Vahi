/**
 * Seed the demo roster by calling the app's own /api/seed route.
 *
 *   pnpm dev                 # in one terminal
 *   pnpm db:seed             # in another
 *
 * Against a deployed instance:
 *   SEED_URL=https://your-app.vercel.app pnpm db:seed
 *
 * Going through the route rather than importing the seeder keeps one code
 * path, so what runs here is exactly what runs in the app.
 */
const base = (process.env.SEED_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const token = process.env.SEED_TOKEN;

if (!token) {
  console.error("SEED_TOKEN is not set. Add it to .env.local, then run with --env-file=.env.local");
  process.exit(1);
}

console.log("seeding " + base + " ...");
const started = Date.now();

let res;
try {
  res = await fetch(base + "/api/seed", {
    method: "POST",
    headers: { "x-seed-token": token },
    signal: AbortSignal.timeout(600_000),
  });
} catch (e) {
  console.error("could not reach " + base + " — is the server running?");
  console.error(e.message);
  process.exit(1);
}

const body = await res.text();
if (!res.ok) {
  console.error("HTTP " + res.status + ": " + body);
  process.exit(1);
}

console.log(body);
console.log("done in " + ((Date.now() - started) / 1000).toFixed(1) + "s");
