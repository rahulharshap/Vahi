/**
 * Vahi compliance rules engine.
 *
 * Given a client profile, derive every statutory obligation that applies to them
 * and expand it into dated occurrences inside a window. This is the piece that
 * takes a year of real customers to get right; everything else is CRUD.
 *
 * Dates encoded here are the standard statutory due dates. CBDT/CBIC extensions
 * are handled as per-occurrence overrides in the DB, never by editing this file.
 */

export type EntityType =
  | "INDIVIDUAL"
  | "PROPRIETOR"
  | "PARTNERSHIP"
  | "LLP"
  | "PVT_LTD"
  | "TRUST";

export type GstScheme = "NONE" | "MONTHLY" | "QRMP" | "COMPOSITION";

export type Category = "GST" | "INCOME_TAX" | "TDS" | "ROC" | "PAYROLL";

export interface ClientProfile {
  id: string;
  name: string;
  entityType: EntityType;
  pan: string | null;
  gstin: string | null;
  gstScheme: GstScheme;
  tdsDeductor: boolean;
  hasEmployees: boolean;
  taxAudit: boolean;
  directorCount: number;
  state: string;
}

export interface Occurrence {
  obligationCode: string;
  title: string;
  category: Category;
  authority: string;
  /** ISO yyyy-mm-dd */
  dueDate: string;
  /** Human label for the period being filed, e.g. "Aug 2026" or "FY 2025-26" */
  periodLabel: string;
  /** Stable key so regeneration is idempotent */
  periodKey: string;
  docsRequired: string[];
  penaltyNote: string;
}

type Expanded = { dueDate: string; periodLabel: string; periodKey: string };

interface Rule {
  code: string;
  title: string;
  category: Category;
  authority: string;
  docsRequired: string[];
  penaltyNote: string;
  applies: (c: ClientProfile) => boolean;
  expand: (c: ClientProfile, from: Date, to: Date) => Expanded[];
}

// ---------------------------------------------------------------- date utils

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Indian financial year label for a date: Apr 2026 -> "2026-27" */
export function fyLabel(d: Date): string {
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return startYear + "-" + String((startYear + 1) % 100).padStart(2, "0");
}

/** FY that ended 31 Mar of `fyEndYear`, e.g. 2026 -> "2025-26" */
function fyEnded(fyEndYear: number): string {
  return fyEndYear - 1 + "-" + String(fyEndYear % 100).padStart(2, "0");
}

/** Assessment year for the FY that ended 31 Mar of `fyEndYear` */
function ayLabel(fyEndYear: number): string {
  return fyEndYear + "-" + String((fyEndYear + 1) % 100).padStart(2, "0");
}

function eachMonth(from: Date, to: Date, cb: (year: number, month: number) => void) {
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    cb(cur.getFullYear(), cur.getMonth());
    cur.setMonth(cur.getMonth() + 1);
  }
}

function inWindow(d: Date, from: Date, to: Date) {
  return d >= from && d <= to;
}

/** Filing for period (year, month) is due on `day` of the following month. */
function monthlyFiling(from: Date, to: Date, day: number, offsetMonths = 1): Expanded[] {
  const out: Expanded[] = [];
  // widen the scan so periods whose due date lands in-window are included
  const scanFrom = new Date(from.getFullYear(), from.getMonth() - offsetMonths - 1, 1);
  const scanTo = new Date(to.getFullYear(), to.getMonth() + 1, 1);
  eachMonth(scanFrom, scanTo, (y, m) => {
    const due = new Date(y, m + offsetMonths, day);
    if (!inWindow(due, from, to)) return;
    out.push({
      dueDate: iso(due),
      periodLabel: MONTHS[m] + " " + y,
      periodKey: y + "-" + String(m + 1).padStart(2, "0"),
    });
  });
  return out;
}

/**
 * Quarterly filing. Keyed by the month index the quarter ends in (2/5/8/11),
 * valued by the month/day the return is due.
 */
function quarterlyFiling(
  from: Date,
  to: Date,
  dueByQuarterEndMonth: Record<number, { month: number; day: number }>,
): Expanded[] {
  const out: Expanded[] = [];
  for (let y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y++) {
    for (const key of Object.keys(dueByQuarterEndMonth)) {
      const endMonth = Number(key);
      const spec = dueByQuarterEndMonth[endMonth];
      // a due month earlier in the calendar than the quarter end rolls to next year
      const dueYear = spec.month < endMonth ? y + 1 : y;
      const due = new Date(dueYear, spec.month, spec.day);
      if (!inWindow(due, from, to)) continue;
      const startMonth = (endMonth - 2 + 12) % 12;
      out.push({
        dueDate: iso(due),
        periodLabel: MONTHS[startMonth] + "-" + MONTHS[endMonth] + " " + y,
        periodKey: y + "-Q" + (Math.floor(endMonth / 3) + 1),
      });
    }
  }
  return out;
}

/** One filing per financial year, due on a fixed month/day after FY end. */
function annualFiling(
  from: Date,
  to: Date,
  dueMonth: number,
  dueDay: number,
  label: (fyEndYear: number) => string,
): Expanded[] {
  const out: Expanded[] = [];
  for (let y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y++) {
    const due = new Date(y, dueMonth, dueDay);
    if (!inWindow(due, from, to)) continue;
    out.push({ dueDate: iso(due), periodLabel: label(y), periodKey: "FY" + y });
  }
  return out;
}

// -------------------------------------------------------------------- rules

const GST_DOCS = [
  "Sales register / outward invoices",
  "Purchase register / inward invoices",
  "Debit and credit notes",
  "Bank statement for the period",
];

export const RULES: Rule[] = [
  {
    code: "GSTR1_M",
    title: "GSTR-1 (outward supplies)",
    category: "GST",
    authority: "GSTN",
    docsRequired: GST_DOCS.slice(0, 3),
    penaltyNote: "Late fee Rs.50/day (Rs.20/day for nil returns). Blocks the recipient's ITC.",
    applies: (c) => c.gstScheme === "MONTHLY",
    expand: (_c, f, t) => monthlyFiling(f, t, 11),
  },
  {
    code: "GSTR3B_M",
    title: "GSTR-3B (summary return and tax payment)",
    category: "GST",
    authority: "GSTN",
    docsRequired: GST_DOCS,
    penaltyNote: "Late fee plus 18% p.a. interest on unpaid tax.",
    applies: (c) => c.gstScheme === "MONTHLY",
    expand: (_c, f, t) => monthlyFiling(f, t, 20),
  },
  {
    code: "GSTR1_Q",
    title: "GSTR-1 quarterly (QRMP)",
    category: "GST",
    authority: "GSTN",
    docsRequired: GST_DOCS.slice(0, 3),
    penaltyNote: "Late fee Rs.50/day. Recipient ITC blocked until filed.",
    applies: (c) => c.gstScheme === "QRMP",
    expand: (_c, f, t) =>
      quarterlyFiling(f, t, {
        5: { month: 6, day: 13 },
        8: { month: 9, day: 13 },
        11: { month: 0, day: 13 },
        2: { month: 3, day: 13 },
      }),
  },
  {
    code: "GSTR3B_Q",
    title: "GSTR-3B quarterly (QRMP)",
    category: "GST",
    authority: "GSTN",
    docsRequired: GST_DOCS,
    penaltyNote: "Late fee plus 18% p.a. interest on unpaid tax.",
    applies: (c) => c.gstScheme === "QRMP",
    expand: (_c, f, t) =>
      quarterlyFiling(f, t, {
        5: { month: 6, day: 22 },
        8: { month: 9, day: 22 },
        11: { month: 0, day: 22 },
        2: { month: 3, day: 22 },
      }),
  },
  {
    code: "CMP08",
    title: "CMP-08 (composition quarterly statement)",
    category: "GST",
    authority: "GSTN",
    docsRequired: ["Turnover summary for the quarter", "Bank statement"],
    penaltyNote: "Late fee Rs.50/day plus interest on tax paid late.",
    applies: (c) => c.gstScheme === "COMPOSITION",
    expand: (_c, f, t) =>
      quarterlyFiling(f, t, {
        5: { month: 6, day: 18 },
        8: { month: 9, day: 18 },
        11: { month: 0, day: 18 },
        2: { month: 3, day: 18 },
      }),
  },
  {
    code: "GSTR9",
    title: "GSTR-9 annual return",
    category: "GST",
    authority: "GSTN",
    docsRequired: [
      "Finalised books for the FY",
      "Reconciliation of GSTR-1 vs 3B vs books",
      "ITC reconciliation with GSTR-2B",
    ],
    penaltyNote: "Late fee up to 0.25% of turnover in the state.",
    applies: (c) => c.gstScheme === "MONTHLY" || c.gstScheme === "QRMP",
    expand: (_c, f, t) => annualFiling(f, t, 11, 31, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "TDS_PAY",
    title: "TDS / TCS deposit",
    category: "TDS",
    authority: "Income Tax Dept",
    docsRequired: ["Payment and deduction register for the month"],
    penaltyNote: "Interest 1.5% per month from date of deduction. Disallowance u/s 40(a)(ia).",
    applies: (c) => c.tdsDeductor,
    expand: (_c, f, t) => monthlyFiling(f, t, 7),
  },
  {
    code: "TDS_RETURN",
    title: "TDS return (24Q / 26Q)",
    category: "TDS",
    authority: "TRACES",
    docsRequired: [
      "Challan details (BSR code, CIN, amounts)",
      "Deductee-wise deduction statement",
      "PAN of all deductees",
    ],
    penaltyNote: "Late fee Rs.200/day u/s 234E until filed. Penalty u/s 271H up to Rs.1,00,000.",
    applies: (c) => c.tdsDeductor,
    expand: (_c, f, t) =>
      quarterlyFiling(f, t, {
        5: { month: 6, day: 31 },
        8: { month: 9, day: 31 },
        11: { month: 0, day: 31 },
        2: { month: 4, day: 31 },
      }),
  },
  {
    code: "ADV_TAX",
    title: "Advance tax instalment",
    category: "INCOME_TAX",
    authority: "Income Tax Dept",
    docsRequired: ["Estimated income for the FY", "TDS credit position (26AS / AIS)"],
    penaltyNote: "Interest u/s 234B and 234C on any shortfall.",
    applies: (c) => c.entityType !== "INDIVIDUAL" || c.taxAudit,
    expand: (_c, f, t) => {
      const out: Expanded[] = [];
      const instalments: Array<[number, number, string]> = [
        [5, 15, "1st instalment (15%)"],
        [8, 15, "2nd instalment (45%)"],
        [11, 15, "3rd instalment (75%)"],
        [2, 15, "4th instalment (100%)"],
      ];
      for (let y = f.getFullYear() - 1; y <= t.getFullYear() + 1; y++) {
        for (const [m, d, label] of instalments) {
          const due = new Date(y, m, d);
          if (!inWindow(due, f, t)) continue;
          out.push({
            dueDate: iso(due),
            periodLabel: label + " FY " + fyLabel(due),
            periodKey: y + "-AT" + m,
          });
        }
      }
      return out;
    },
  },
  {
    code: "ITR_NONAUDIT",
    title: "Income tax return (non-audit)",
    category: "INCOME_TAX",
    authority: "Income Tax Dept",
    docsRequired: [
      "Form 16 / Form 16A",
      "Bank statements for the FY",
      "Capital gains statement (if any)",
      "Investment and deduction proofs (80C, 80D)",
      "AIS / TIS download",
    ],
    penaltyNote: "Late fee u/s 234F up to Rs.5,000. Loss carry-forward is denied.",
    applies: (c) => !c.taxAudit,
    expand: (_c, f, t) => annualFiling(f, t, 6, 31, (y) => "AY " + ayLabel(y)),
  },
  {
    code: "TAX_AUDIT",
    title: "Tax audit report (3CA/3CB and 3CD)",
    category: "INCOME_TAX",
    authority: "Income Tax Dept",
    docsRequired: [
      "Finalised books of account",
      "Fixed asset register and depreciation schedule",
      "Loan confirmations and interest certificates",
      "Stock statement as at year end",
    ],
    penaltyNote: "Penalty u/s 271B: 0.5% of turnover, max Rs.1,50,000.",
    applies: (c) => c.taxAudit,
    expand: (_c, f, t) => annualFiling(f, t, 8, 30, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "ITR_AUDIT",
    title: "Income tax return (audit case)",
    category: "INCOME_TAX",
    authority: "Income Tax Dept",
    docsRequired: ["Signed tax audit report", "Finalised financial statements", "AIS / TIS download"],
    penaltyNote: "Late fee u/s 234F and interest u/s 234A on unpaid tax.",
    applies: (c) => c.taxAudit,
    expand: (_c, f, t) => annualFiling(f, t, 9, 31, (y) => "AY " + ayLabel(y)),
  },
  {
    code: "AOC4",
    title: "AOC-4 (financial statements)",
    category: "ROC",
    authority: "MCA",
    docsRequired: ["Adopted financial statements", "Board report and auditor report", "AGM minutes"],
    penaltyNote: "Rs.100 per day of delay, with no cap.",
    applies: (c) => c.entityType === "PVT_LTD",
    expand: (_c, f, t) => annualFiling(f, t, 9, 30, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "MGT7",
    title: "MGT-7 (annual return)",
    category: "ROC",
    authority: "MCA",
    docsRequired: ["Shareholding pattern at year end", "List of directors and changes", "AGM minutes"],
    penaltyNote: "Rs.100 per day of delay, with no cap.",
    applies: (c) => c.entityType === "PVT_LTD",
    expand: (_c, f, t) => annualFiling(f, t, 10, 29, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "LLP11",
    title: "LLP Form 11 (annual return)",
    category: "ROC",
    authority: "MCA",
    docsRequired: ["Partner contribution details", "List of partners and changes"],
    penaltyNote: "Rs.100 per day of delay, with no cap.",
    applies: (c) => c.entityType === "LLP",
    expand: (_c, f, t) => annualFiling(f, t, 4, 30, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "LLP8",
    title: "LLP Form 8 (statement of account and solvency)",
    category: "ROC",
    authority: "MCA",
    docsRequired: ["Statement of accounts", "Solvency declaration signed by partners"],
    penaltyNote: "Rs.100 per day of delay, with no cap.",
    applies: (c) => c.entityType === "LLP",
    expand: (_c, f, t) => annualFiling(f, t, 9, 30, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "DIR3KYC",
    title: "DIR-3 KYC (director KYC)",
    category: "ROC",
    authority: "MCA",
    docsRequired: ["Director PAN and Aadhaar", "Personal mobile and email for OTP"],
    penaltyNote: "DIN deactivated. Rs.5,000 reactivation fee per director.",
    applies: (c) => (c.entityType === "PVT_LTD" || c.entityType === "LLP") && c.directorCount > 0,
    expand: (_c, f, t) => annualFiling(f, t, 8, 30, (y) => "FY " + fyEnded(y)),
  },
  {
    code: "PF_ECR",
    title: "PF electronic challan (ECR)",
    category: "PAYROLL",
    authority: "EPFO",
    docsRequired: ["Monthly salary sheet", "New joiner and exit list with UAN"],
    penaltyNote: "Interest 12% p.a. plus damages of up to 25% p.a.",
    applies: (c) => c.hasEmployees,
    expand: (_c, f, t) => monthlyFiling(f, t, 15),
  },
  {
    code: "ESI",
    title: "ESI contribution",
    category: "PAYROLL",
    authority: "ESIC",
    docsRequired: ["Monthly salary sheet", "Employee IP numbers"],
    penaltyNote: "Interest 12% p.a. plus damages.",
    applies: (c) => c.hasEmployees,
    expand: (_c, f, t) => monthlyFiling(f, t, 15),
  },
  {
    code: "PT_TS",
    title: "Professional tax (Telangana)",
    category: "PAYROLL",
    authority: "CT Dept, Telangana",
    docsRequired: ["Monthly salary sheet with PT slabs"],
    penaltyNote: "Interest and penalty under the Telangana PT Act.",
    applies: (c) => c.hasEmployees && c.state === "Telangana",
    expand: (_c, f, t) => monthlyFiling(f, t, 10),
  },
];

// ------------------------------------------------------------------- public

export function obligationsFor(client: ClientProfile): Rule[] {
  return RULES.filter((r) => r.applies(client));
}

/** Expand every applicable rule into dated occurrences inside [from, to]. */
export function generateOccurrences(
  client: ClientProfile,
  fromISO: string,
  toISO: string,
): Occurrence[] {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  const out: Occurrence[] = [];
  for (const rule of obligationsFor(client)) {
    for (const occ of rule.expand(client, from, to)) {
      out.push({
        dueDate: occ.dueDate,
        periodLabel: occ.periodLabel,
        periodKey: occ.periodKey,
        obligationCode: rule.code,
        title: rule.title,
        category: rule.category,
        authority: rule.authority,
        docsRequired: rule.docsRequired,
        penaltyNote: rule.penaltyNote,
      });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const CATEGORY_LABEL: Record<Category, string> = {
  GST: "GST",
  INCOME_TAX: "Income tax",
  TDS: "TDS",
  ROC: "ROC / MCA",
  PAYROLL: "Payroll",
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  INDIVIDUAL: "Individual",
  PROPRIETOR: "Proprietorship",
  PARTNERSHIP: "Partnership firm",
  LLP: "LLP",
  PVT_LTD: "Private limited",
  TRUST: "Trust / society",
};
