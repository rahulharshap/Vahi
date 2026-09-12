/**
 * Tests for the rules engine — the one file where being wrong costs a client
 * money. Everything else in this repo is CRUD around it.
 *
 * These assert real statutory dates. If a rule is edited carelessly, this
 * fails loudly rather than quietly filing something late.
 *
 *   node tests/compliance.test.mjs
 */
import { generateOccurrences, obligationsFor, RULES, fyLabel, iso, parseISO } from "../src/lib/compliance.ts";

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "  OK   " : "  FAIL ") + name + (detail ? " -> " + detail : ""));
  ok ? pass++ : fail++;
};

const client = (over = {}) => ({
  id: "c1",
  name: "Test",
  entityType: "PVT_LTD",
  pan: "AAACT1234A",
  gstin: "36AAACT1234A1ZP",
  gstScheme: "MONTHLY",
  tdsDeductor: true,
  hasEmployees: true,
  taxAudit: true,
  directorCount: 3,
  state: "Telangana",
  ...over,
});

const FY = ["2026-04-01", "2027-03-31"];
const dates = (occ, code) => occ.filter((o) => o.obligationCode === code).map((o) => o.dueDate);

// ------------------------------------------------- statutory dates by rule
console.log("--- statutory due dates (Pvt Ltd, full registrations) ---");
const full = generateOccurrences(client(), ...FY);

const expectDate = (code, date) => check(code + " on " + date, dates(full, code).includes(date), dates(full, code).slice(0, 5).join(",") || "none");

expectDate("GSTR1_M", "2026-09-11"); // 11th of the following month
expectDate("GSTR3B_M", "2026-09-20"); // 20th of the following month
expectDate("TDS_PAY", "2026-09-07"); // 7th of the following month
expectDate("PF_ECR", "2026-09-15");
expectDate("ESI", "2026-09-15");
expectDate("PT_TS", "2026-09-10"); // Telangana professional tax
expectDate("TDS_RETURN", "2026-10-31"); // Q2 (Jul-Sep)
expectDate("TDS_RETURN", "2026-05-31"); // Q4 of the prior FY: filed 31 May, an extra month
expectDate("ADV_TAX", "2026-06-15");
expectDate("ADV_TAX", "2026-09-15");
expectDate("ADV_TAX", "2026-12-15");
expectDate("ADV_TAX", "2027-03-15");
expectDate("TAX_AUDIT", "2026-09-30");
expectDate("ITR_AUDIT", "2026-10-31");
expectDate("AOC4", "2026-10-30");
expectDate("MGT7", "2026-11-29");
expectDate("DIR3KYC", "2026-09-30");
expectDate("GSTR9", "2026-12-31");

// ------------------------------------------------------------- cardinality
console.log("\n--- how many of each per year ---");
const countOf = (code) => dates(full, code).length;
check("12 monthly GSTR-1", countOf("GSTR1_M") === 12, String(countOf("GSTR1_M")));
check("12 monthly GSTR-3B", countOf("GSTR3B_M") === 12, String(countOf("GSTR3B_M")));
check("4 TDS returns", countOf("TDS_RETURN") === 4, String(countOf("TDS_RETURN")));
check("4 advance tax instalments", countOf("ADV_TAX") === 4, String(countOf("ADV_TAX")));
check("1 tax audit", countOf("TAX_AUDIT") === 1, String(countOf("TAX_AUDIT")));

// -------------------------------------------------------------- applicability
console.log("\n--- the right obligations for the right client ---");

const salaried = generateOccurrences(
  client({ entityType: "INDIVIDUAL", gstScheme: "NONE", gstin: null, tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0 }),
  ...FY,
);
check(
  "salaried individual gets exactly one ITR",
  salaried.length === 1 && salaried[0].obligationCode === "ITR_NONAUDIT" && salaried[0].dueDate === "2026-07-31",
  salaried.map((o) => o.obligationCode + "@" + o.dueDate).join(","),
);

const qrmp = generateOccurrences(client({ gstScheme: "QRMP", taxAudit: false }), ...FY);
check("QRMP gets no monthly GST returns", !qrmp.some((o) => o.obligationCode === "GSTR3B_M"));
check("QRMP gets quarterly GST returns", dates(qrmp, "GSTR3B_Q").length === 4, String(dates(qrmp, "GSTR3B_Q").length));

const comp = generateOccurrences(client({ gstScheme: "COMPOSITION", taxAudit: false }), ...FY);
check("composition gets CMP-08, not GSTR-3B", dates(comp, "CMP08").length === 4 && !comp.some((o) => o.obligationCode.startsWith("GSTR3B")));
check("composition files no GSTR-9", !comp.some((o) => o.obligationCode === "GSTR9"));

const noGst = generateOccurrences(client({ gstScheme: "NONE", gstin: null, taxAudit: false }), ...FY);
check("unregistered client gets no GST filings", !noGst.some((o) => o.category === "GST"));

const noStaff = generateOccurrences(client({ hasEmployees: false }), ...FY);
check("no employees means no PF/ESI/PT", !noStaff.some((o) => o.category === "PAYROLL"));

const ap = generateOccurrences(client({ state: "Andhra Pradesh" }), ...FY);
check("professional tax is Telangana-only", !ap.some((o) => o.obligationCode === "PT_TS"));

const llp = generateOccurrences(client({ entityType: "LLP", taxAudit: false }), ...FY);
check("LLP files Form 11 on 30 May", dates(llp, "LLP11").includes("2026-05-30"), dates(llp, "LLP11").join(","));
check("LLP files Form 8 on 30 Oct", dates(llp, "LLP8").includes("2026-10-30"), dates(llp, "LLP8").join(","));
check("LLP does not file AOC-4 or MGT-7", !llp.some((o) => ["AOC4", "MGT7"].includes(o.obligationCode)));

const prop = generateOccurrences(client({ entityType: "PROPRIETOR", taxAudit: false, directorCount: 0 }), ...FY);
check("proprietor files no ROC forms", !prop.some((o) => o.category === "ROC"));

// audit status must move the ITR date, not duplicate it
const audited = generateOccurrences(client({ taxAudit: true }), ...FY);
check("audit case files ITR on 31 Oct, not 31 Jul", dates(audited, "ITR_AUDIT").includes("2026-10-31") && dates(audited, "ITR_NONAUDIT").length === 0);
const notAudited = generateOccurrences(client({ taxAudit: false }), ...FY);
check("non-audit case files ITR on 31 Jul", dates(notAudited, "ITR_NONAUDIT").includes("2026-07-31") && dates(notAudited, "TAX_AUDIT").length === 0);

// -------------------------------------------------------------- invariants
console.log("\n--- invariants ---");
check("every rule has a penalty note", RULES.every((r) => r.penaltyNote && r.penaltyNote.length > 10));
check("every rule says who it applies to", RULES.every((r) => r.appliesWhen && r.appliesWhen.length > 10),
  RULES.filter((r) => !r.appliesWhen).map((r) => r.code).join(",") || "all present");
check("every rule describes its schedule", RULES.every((r) => r.schedule && r.schedule.length > 5),
  RULES.filter((r) => !r.schedule).map((r) => r.code).join(",") || "all present");
check("every rule declares required documents", RULES.every((r) => Array.isArray(r.docsRequired)));
check("rule codes are unique", new Set(RULES.map((r) => r.code)).size === RULES.length);
check("occurrences come back sorted by due date", full.every((o, i) => i === 0 || full[i - 1].dueDate <= o.dueDate));
check(
  "period keys are unique per obligation",
  (() => {
    const seen = new Set();
    for (const o of full) {
      const k = o.obligationCode + "|" + o.periodKey;
      if (seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  })(),
);
check("every occurrence falls inside the requested window", full.every((o) => o.dueDate >= FY[0] && o.dueDate <= FY[1]));

// regeneration must be stable, or calendar sync would create duplicates
const again = generateOccurrences(client(), ...FY);
check(
  "generation is deterministic",
  JSON.stringify(again.map((o) => o.obligationCode + o.periodKey + o.dueDate)) ===
    JSON.stringify(full.map((o) => o.obligationCode + o.periodKey + o.dueDate)),
);

// an empty window must produce nothing, not everything
check("empty window yields no occurrences", generateOccurrences(client(), "2026-09-01", "2026-09-01").every((o) => o.dueDate === "2026-09-01"));

console.log("\n--- financial year labelling ---");
check("April 2026 is FY 2026-27", fyLabel(parseISO("2026-04-01")) === "2026-27", fyLabel(parseISO("2026-04-01")));
check("March 2026 is FY 2025-26", fyLabel(parseISO("2026-03-31")) === "2025-26", fyLabel(parseISO("2026-03-31")));
check("iso() round-trips", iso(parseISO("2026-09-30")) === "2026-09-30");

console.log("\n--- obligations for a full-registration Pvt Ltd ---");
const rules = obligationsFor(client());
console.log("  " + rules.map((r) => r.code).join(" "));
check("14 distinct obligations apply", rules.length === 14, String(rules.length));
check("86 dated occurrences in the year", full.length === 86, String(full.length));

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
