/**
 * Tests for the API surface's supporting logic.
 *
 * Redaction is the one here that matters. Logs go to a host's collector and
 * are read by whoever has access to it; a connection string or API key that
 * reaches a log line has effectively been handed over. This asserts the
 * scrubber catches the shapes that actually turn up — credentials nested in
 * error objects, and connection strings embedded in message text.
 */
const { scrub, limitFrom } = await import("../src/lib/redact.ts");

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "  OK   " : "  FAIL ") + name + (detail ? " -> " + detail : ""));
  ok ? pass++ : fail++;
};
const json = (v) => JSON.stringify(scrub(v));

console.log("--- log redaction ---");
check("password field redacted", json({ password: "hunter2" }) === '{"password":"[redacted]"}', json({ password: "hunter2" }));
check("token field redacted", json({ token: "abc" }) === '{"token":"[redacted]"}');
check("api_key field redacted", json({ api_key: "k" }) === '{"api_key":"[redacted]"}');
check("authorization header redacted", json({ authorization: "Bearer x" }) === '{"authorization":"[redacted]"}');
check("DATABASE_URL field redacted", json({ DATABASE_URL: "postgresql://u:p@h/db" }) === '{"DATABASE_URL":"[redacted]"}');

check(
  "connection string inside a message is redacted",
  json({ message: "connect failed: postgresql://postgres:secret@db.host:5432/postgres" }).includes("[redacted]") &&
    !json({ message: "connect failed: postgresql://postgres:secret@db.host:5432/postgres" }).includes("secret"),
  json({ message: "connect failed: postgresql://postgres:secret@db.host:5432/postgres" }),
);
check(
  "an api key inside a message is redacted",
  !json({ message: "bad key vahi_C2IaceE5TrYJZYVJQEQ4AYzimio" }).includes("C2IaceE5"),
  json({ message: "bad key vahi_C2IaceE5TrYJZYVJQEQ4AYzimio" }),
);
check(
  "nested credentials are redacted",
  !json({ ctx: { db: { password: "p" } } }).includes('"p"'),
  json({ ctx: { db: { password: "p" } } }),
);
check("ordinary fields survive", json({ filingId: "fil_1", count: 3 }) === '{"filingId":"fil_1","count":3}');
check("arrays are walked", json([{ token: "t" }]) === '[{"token":"[redacted]"}]');
check("null and undefined are safe", json({ a: null }) === '{"a":null}');
check("deep nesting terminates", typeof scrub({ a: { b: { c: { d: { e: { f: "x" } } } } } }) === "object");

console.log("\n--- pagination limits ---");
const p = (qs) => new URLSearchParams(qs);
check("absent limit uses the default", limitFrom(p("")) === 50);
check("a given limit is honoured", limitFrom(p("limit=10")) === 10);
check("limits are capped", limitFrom(p("limit=99999")) === 500);
check("a negative limit falls back", limitFrom(p("limit=-5")) === 50);
check("a non-numeric limit falls back", limitFrom(p("limit=abc")) === 50);
check("a fractional limit floors", limitFrom(p("limit=10.9")) === 10);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
