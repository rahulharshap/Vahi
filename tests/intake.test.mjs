/**
 * Tests for document intake — addressing and the matching cascade.
 *
 * Two of these are regressions for bugs found only by running the thing:
 * lowercasing a recipient address destroyed the base64url token, and the
 * token path looked its filing up in a windowed candidate list instead of
 * trusting the token. Both produced silently wrong behaviour rather than an
 * error, which is exactly the failure mode this whole cascade exists to avoid.
 *
 *   node tests/intake.test.mjs
 */
process.env.INTAKE_SECRET ||= "test-secret";
process.env.INTAKE_DOMAIN ||= "in.test.local";

const {
  filingToken,
  verifyFilingToken,
  replyAddress,
  filingFromRecipients,
  labelFromFilename,
  matchDocument,
} = await import("../src/lib/intake.ts");

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "  OK   " : "  FAIL ") + name + (detail ? " -> " + detail : ""));
  ok ? pass++ : fail++;
};

const GST_DOCS = [
  "Sales register / outward invoices",
  "Purchase register / inward invoices",
  "Debit and credit notes",
  "Bank statement for the period",
];

// -------------------------------------------------------------------- tokens
console.log("--- tokens ---");
const id = "fil_ykb0abnq948e";
const tok = filingToken(id);
check("round-trips", verifyFilingToken(tok) === id, verifyFilingToken(tok) ?? "null");
check("rejects a tampered signature", verifyFilingToken(tok.split(".")[0] + ".AAAAAAAAAAAAAAAA") === null);
check("rejects a tampered payload", verifyFilingToken(Buffer.from("fil_other").toString("base64url") + "." + tok.split(".")[1]) === null);
check("rejects gibberish", verifyFilingToken("nonsense") === null);
check("rejects an empty token", verifyFilingToken("") === null);
check("a different filing gets a different token", filingToken("fil_zzz") !== tok);

console.log("\n--- addressing ---");
const addr = replyAddress(id);
check("address is plus-addressed on the intake domain", addr === "docs+" + tok + "@in.test.local", addr);
check("extracted from a bare address", filingFromRecipients([addr]) === id);
check("extracted from a display-name form", filingFromRecipients(['"Vahi" <' + addr + ">"]) === id);
check("found among several recipients", filingFromRecipients(["a@b.com", addr, "c@d.com"]) === id);
check("absent when no token present", filingFromRecipients(["docs@in.test.local"]) === null);

// REGRESSION: base64url is case-sensitive. An earlier version lowercased the
// recipient before extracting, which silently broke every valid token.
const mixedCase = tok !== tok.toLowerCase();
check("token contains upper-case characters (so case matters)", mixedCase, tok);
check(
  "REGRESSION: a lowercased address must not validate",
  filingFromRecipients([addr.toLowerCase()]) === null || !mixedCase,
);

// ------------------------------------------------------------------ labelling
console.log("\n--- filename to document label ---");
check("a descriptive name picks its document",
  labelFromFilename("purchase_register_aug2026.pdf", GST_DOCS) === "Purchase register / inward invoices",
  String(labelFromFilename("purchase_register_aug2026.pdf", GST_DOCS)));
check("another one picks a different document",
  labelFromFilename("sales_outward_invoices.pdf", GST_DOCS) === "Sales register / outward invoices",
  String(labelFromFilename("sales_outward_invoices.pdf", GST_DOCS)));
check("a camera filename matches nothing", labelFromFilename("IMG_4821.jpg", GST_DOCS) === null);
check("a single outstanding document needs no guessing",
  labelFromFilename("whatever.pdf", ["Monthly salary sheet"]) === "Monthly salary sheet");
check("nothing outstanding yields nothing", labelFromFilename("x.pdf", []) === null);
check("an ambiguous name is left alone rather than guessed",
  labelFromFilename("invoices.pdf", GST_DOCS) === null,
  String(labelFromFilename("invoices.pdf", GST_DOCS)));

// ------------------------------------------------------------------- cascade
console.log("\n--- the matching cascade ---");
const candidates = [
  { id: "f1", clientId: "c1", docsOutstanding: GST_DOCS, title: "GSTR-3B", periodLabel: "Aug 2026" },
  { id: "f2", clientId: "c2", docsOutstanding: ["Monthly salary sheet"], title: "PF ECR", periodLabel: "Aug 2026" },
  { id: "f3", clientId: "c1", docsOutstanding: ["Monthly salary sheet"], title: "ESI", periodLabel: "Aug 2026" },
];

let r = matchDocument({ tokenFilingId: "f1", fileName: "purchase_register.pdf", clientId: null, candidates });
check("TOKEN wins outright", r.filingId === "f1" && r.matchedBy === "TOKEN");
check("TOKEN also labels when the filename allows", r.docLabel === "Purchase register / inward invoices", String(r.docLabel));

// REGRESSION: a token for a filing outside the candidate window must still
// route; only the label is unknown.
r = matchDocument({ tokenFilingId: "f_far_future", fileName: "x.pdf", clientId: null, candidates });
check("REGRESSION: TOKEN routes even when the filing is not a candidate",
  r.filingId === "f_far_future" && r.matchedBy === "TOKEN" && r.docLabel === null);

r = matchDocument({ tokenFilingId: null, fileName: "salary.pdf", clientId: "c2", candidates });
check("SENDER matches when the client has one open filing", r.filingId === "f2" && r.matchedBy === "SENDER");

r = matchDocument({ tokenFilingId: null, fileName: "purchase_register.pdf", clientId: "c1", candidates });
check("FILENAME breaks the tie when a client has several", r.filingId === "f1" && r.matchedBy === "FILENAME", r.matchedBy ?? "none");

r = matchDocument({ tokenFilingId: null, fileName: "IMG_4821.jpg", clientId: "c1", candidates });
check("an unlabelled photo across several filings stays unmatched", r.filingId === null && r.matchedBy === null);

r = matchDocument({ tokenFilingId: null, fileName: "anything.pdf", clientId: null, candidates });
check("an unknown sender with no token stays unmatched", r.filingId === null);

r = matchDocument({ tokenFilingId: null, fileName: "x.pdf", clientId: "c_unknown", candidates });
check("an unrecognised client stays unmatched", r.filingId === null);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
