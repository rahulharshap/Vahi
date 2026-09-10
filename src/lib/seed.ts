import { q, exec, uid, nowISO } from "./db";
import {
  FIRM_ID,
  addDays,
  createClient,
  ensureFirm,
  listFilings,
  syncAllFilings,
  todayISO,
  type ClientInput,
} from "./store";
import { composeChase, type Stage } from "./whatsapp";

/**
 * Demo roster for a mid-size Hyderabad practice. Deliberately messy in the way
 * real client lists are: a few audit cases, a mix of GST schemes, some clients
 * with no GST at all, some chronically late.
 */
const CLIENTS: ClientInput[] = [
  { name: "Sri Lakshmi Traders", entityType: "PROPRIETOR", pan: "AABPL1234C", gstin: "36AABPL1234C1ZP", gstScheme: "MONTHLY", tdsDeductor: false, hasEmployees: true, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Ravi Kumar", contactPhone: "+919848012345" },
  { name: "Veda Software Labs Pvt Ltd", entityType: "PVT_LTD", pan: "AACCV5566D", gstin: "36AACCV5566D1ZQ", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 3, state: "Telangana", contactName: "Sneha Reddy", contactPhone: "+919000112233" },
  { name: "Konda Constructions LLP", entityType: "LLP", pan: "AAFCK7788E", gstin: "36AAFCK7788E1ZR", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 2, state: "Telangana", contactName: "Mahesh Konda", contactPhone: "+919391445566" },
  { name: "Anjali Textiles", entityType: "PROPRIETOR", pan: "ABCPA9911F", gstin: "36ABCPA9911F1ZS", gstScheme: "QRMP", tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Anjali Devi", contactPhone: "+919885667788" },
  { name: "Charminar Foods & Beverages", entityType: "PARTNERSHIP", pan: "AAGFC2233G", gstin: "36AAGFC2233G1ZT", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Telangana", contactName: "Imran Ali", contactPhone: "+919701223344" },
  { name: "Nirmal Diagnostics Pvt Ltd", entityType: "PVT_LTD", pan: "AADCN4455H", gstin: "36AADCN4455H1ZU", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: false, directorCount: 2, state: "Telangana", contactName: "Dr. Praveen", contactPhone: "+919948556677" },
  { name: "Gachibowli Realty LLP", entityType: "LLP", pan: "AAGCG6677J", gstin: "36AAGCG6677J1ZV", gstScheme: "QRMP", tdsDeductor: true, hasEmployees: false, taxAudit: false, directorCount: 2, state: "Telangana", contactName: "Suresh Naidu", contactPhone: "+919393778899" },
  { name: "Sai Krishna Agro Exports", entityType: "PARTNERSHIP", pan: "AAHFS8899K", gstin: "37AAHFS8899K1ZW", gstScheme: "MONTHLY", tdsDeductor: false, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Andhra Pradesh", contactName: "Krishna Rao", contactPhone: "+919440889900" },
  { name: "Bright Minds Coaching Centre", entityType: "PROPRIETOR", pan: "ADFPB1122L", gstin: null, gstScheme: "NONE", tdsDeductor: false, hasEmployees: true, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Latha Sharma", contactPhone: "+919866990011" },
  { name: "Deccan Logistics Pvt Ltd", entityType: "PVT_LTD", pan: "AAECD3344M", gstin: "36AAECD3344M1ZX", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 4, state: "Telangana", contactName: "Vinod Jain", contactPhone: "+919912001122" },
  { name: "Padma Jewellers", entityType: "PROPRIETOR", pan: "AFGPP5566N", gstin: "36AFGPP5566N1ZY", gstScheme: "COMPOSITION", tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Padmavathi", contactPhone: "+919849112233" },
  { name: "Orbit Interiors LLP", entityType: "LLP", pan: "AAKCO7788P", gstin: "36AAKCO7788P1ZZ", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: false, directorCount: 2, state: "Telangana", contactName: "Rakesh Varma", contactPhone: "+919603223344" },
  { name: "Kavya Pharma Distributors", entityType: "PARTNERSHIP", pan: "AAMFK9900Q", gstin: "36AAMFK9900Q1Z1", gstScheme: "MONTHLY", tdsDeductor: false, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Telangana", contactName: "Kavya Sree", contactPhone: "+919704334455" },
  { name: "Rajesh Kumar (Salaried)", entityType: "INDIVIDUAL", pan: "AHIPR1234R", gstin: null, gstScheme: "NONE", tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Rajesh Kumar", contactPhone: "+919885445566" },
  { name: "Meenakshi Iyer (Consultant)", entityType: "INDIVIDUAL", pan: "AJKPM2345S", gstin: "36AJKPM2345S1Z2", gstScheme: "QRMP", tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Meenakshi Iyer", contactPhone: "+919948556699" },
  { name: "Telangana Steel Works", entityType: "PARTNERSHIP", pan: "AANFT3456T", gstin: "36AANFT3456T1Z3", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Telangana", contactName: "Bhaskar Rao", contactPhone: "+919391667788" },
  { name: "Cloudline Systems Pvt Ltd", entityType: "PVT_LTD", pan: "AAPCC4567U", gstin: "36AAPCC4567U1Z4", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: false, directorCount: 2, state: "Telangana", contactName: "Nithin Reddy", contactPhone: "+919000778899" },
  { name: "Sagar Hospitality Services", entityType: "PROPRIETOR", pan: "AQRPS5678V", gstin: "36AQRPS5678V1Z5", gstScheme: "QRMP", tdsDeductor: false, hasEmployees: true, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Sagar Patel", contactPhone: "+919866889900" },
  { name: "Vijaya Educational Trust", entityType: "TRUST", pan: "AAATV6789W", gstin: null, gstScheme: "NONE", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Telangana", contactName: "Sister Vijaya", contactPhone: "+919440990011" },
  { name: "Amaravati Infra Projects", entityType: "PARTNERSHIP", pan: "AAUFA7890X", gstin: "37AAUFA7890X1Z6", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Andhra Pradesh", contactName: "Narasimha Rao", contactPhone: "+919704001122" },
  { name: "Hitech Auto Spares", entityType: "PROPRIETOR", pan: "AWXPH8901Y", gstin: "36AWXPH8901Y1Z7", gstScheme: "MONTHLY", tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Faisal Khan", contactPhone: "+919912112233" },
  { name: "Greenfield Organics LLP", entityType: "LLP", pan: "AAZCG9012Z", gstin: "36AAZCG9012Z1Z8", gstScheme: "QRMP", tdsDeductor: false, hasEmployees: true, taxAudit: false, directorCount: 3, state: "Telangana", contactName: "Divya Menon", contactPhone: "+919603334455" },
  { name: "Prasad Media Networks Pvt Ltd", entityType: "PVT_LTD", pan: "ABBCP0123A", gstin: "36ABBCP0123A1Z9", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 3, state: "Telangana", contactName: "Prasad Rao", contactPhone: "+919849223344" },
  { name: "Shanti Home Furnishings", entityType: "PROPRIETOR", pan: "ACDPS1234B", gstin: "36ACDPS1234B1ZA", gstScheme: "COMPOSITION", tdsDeductor: false, hasEmployees: false, taxAudit: false, directorCount: 0, state: "Telangana", contactName: "Shanti Bai", contactPhone: "+919885334455" },
  { name: "Nova Analytics Pvt Ltd", entityType: "PVT_LTD", pan: "ABGCN2345C", gstin: "36ABGCN2345C1ZB", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: false, directorCount: 2, state: "Telangana", contactName: "Arjun Sethi", contactPhone: "+919393556677" },
  { name: "Warangal Cotton Mills", entityType: "PARTNERSHIP", pan: "ABJFW3456D", gstin: "36ABJFW3456D1ZC", gstScheme: "MONTHLY", tdsDeductor: true, hasEmployees: true, taxAudit: true, directorCount: 0, state: "Telangana", contactName: "Srinivas Goud", contactPhone: "+919948667788" },
];

/** Deterministic pseudo-random so the demo looks the same on every reset. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seedIfEmpty(): Promise<boolean> {
  const existing = await q<{ n: number | string }>("SELECT COUNT(*) AS n FROM clients WHERE firm_id=?", [FIRM_ID]);
  if (Number(existing[0]?.n ?? 0) > 0) return false;
  return reseed();
}

export async function reseed(): Promise<boolean> {
  await ensureFirm("Rao & Associates, Chartered Accountants", "Hyderabad");
  await exec("DELETE FROM messages");
  await exec("DELETE FROM filings");
  await exec("DELETE FROM clients WHERE firm_id=?", [FIRM_ID]);

  for (const c of CLIENTS) await createClient(c);

  const today = todayISO();
  await syncAllFilings(addDays(today, -220), addDays(today, 200));

  // Backfill a believable working state: older filings mostly done, recent ones
  // in varying stages, a handful chronically stuck.
  const rand = rng(20260910);
  const rows = await listFilings({});
  for (const f of rows) {
    const r = rand();
    if (f.daysLeft < -25) {
      // long past - almost everything is filed
      if (r < 0.94) {
        await exec("UPDATE filings SET status='FILED', filed_at=? , docs_received=? WHERE id=?", [
          addDays(f.effectiveDue, -2) + " 11:00:00",
          f.docs_required,
          f.id,
        ]);
      }
    } else if (f.daysLeft < 0) {
      // recently past due - a realistic tail of stragglers
      if (r < 0.62) {
        await exec("UPDATE filings SET status='FILED', filed_at=?, docs_received=? WHERE id=?", [
          addDays(f.effectiveDue, -1) + " 16:30:00",
          f.docs_required,
          f.id,
        ]);
      } else if (r < 0.78) {
        await exec("UPDATE filings SET status='IN_PROGRESS', docs_received=? WHERE id=?", [f.docs_required, f.id]);
      } else if (r < 0.9) {
        await partialDocs(f.id, f.docsRequiredList, rand);
      }
    } else if (f.daysLeft <= 20) {
      if (r < 0.28) {
        await exec("UPDATE filings SET status='DOCS_RECEIVED', docs_received=? WHERE id=?", [f.docs_required, f.id]);
      } else if (r < 0.42) {
        await exec("UPDATE filings SET status='IN_PROGRESS', docs_received=? WHERE id=?", [f.docs_required, f.id]);
      } else if (r < 0.7) {
        await partialDocs(f.id, f.docsRequiredList, rand);
      }
    }
  }

  // A few historical chases so the activity feed is not empty on first load.
  const chaseable = (await listFilings({ from: addDays(today, -20), to: addDays(today, 15) })).filter(
    (f) => f.docsOutstanding.length > 0 && f.status !== "FILED",
  );
  const firmName = "Rao & Associates";
  for (const f of chaseable.slice(0, 18)) {
    const stages: Stage[] = f.daysLeft < 0 ? ["T10", "T5", "T2", "T1"] : f.daysLeft <= 5 ? ["T10", "T5"] : ["T10"];
    for (const stage of stages) {
      const body = composeChase(stage, {
        clientName: f.clientName,
        contactName: f.contactName,
        filingTitle: f.title,
        periodLabel: f.period_label,
        dueDate: f.effectiveDue,
        docsOutstanding: f.docsOutstanding,
        firmName,
        penaltyNote: f.penalty_note,
      });
      await exec(
        "INSERT INTO messages (id, filing_id, client_id, stage, body, status, sent_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [
          uid("msg"),
          f.id,
          f.client_id,
          stage,
          body,
          "SENT",
          addDays(f.effectiveDue, -(stage === "T10" ? 10 : stage === "T5" ? 5 : stage === "T2" ? 2 : 1)) + " 09:30:00",
          addDays(f.effectiveDue, -(stage === "T10" ? 10 : stage === "T5" ? 5 : stage === "T2" ? 2 : 1)) + " 09:30:00",
        ],
      );
    }
  }
  return true;
}

async function partialDocs(filingId: string, required: string[], rand: () => number) {
  if (required.length < 2) return;
  const keep = required.filter(() => rand() < 0.5);
  await exec("UPDATE filings SET docs_received=?, status='AWAITING_DOCS' WHERE id=?", [JSON.stringify(keep), filingId]);
}
