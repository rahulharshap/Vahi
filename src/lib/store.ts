import { all, get, run, uid } from "./db";
import {
  generateOccurrences,
  iso,
  parseISO,
  type ClientProfile,
  type EntityType,
  type GstScheme,
  type Category,
} from "./compliance";
import { STAGE_OFFSET, type Stage } from "./whatsapp";

export const FIRM_ID = "firm_demo";

export type FilingStatus =
  | "AWAITING_DOCS"
  | "DOCS_RECEIVED"
  | "IN_PROGRESS"
  | "FILED"
  | "NOT_APPLICABLE";

export const STATUS_LABEL: Record<FilingStatus, string> = {
  AWAITING_DOCS: "Awaiting documents",
  DOCS_RECEIVED: "Documents in",
  IN_PROGRESS: "Being prepared",
  FILED: "Filed",
  NOT_APPLICABLE: "Not applicable",
};

export interface ClientRow {
  id: string;
  firm_id: string;
  name: string;
  entity_type: EntityType;
  pan: string | null;
  gstin: string | null;
  gst_scheme: GstScheme;
  tds_deductor: number;
  has_employees: number;
  tax_audit: number;
  director_count: number;
  state: string;
  contact_name: string | null;
  contact_phone: string | null;
  active: number;
}

export interface FilingRow {
  id: string;
  client_id: string;
  obligation_code: string;
  title: string;
  category: Category;
  authority: string;
  period_key: string;
  period_label: string;
  due_date: string;
  extended_due: string | null;
  status: FilingStatus;
  docs_required: string;
  docs_received: string;
  penalty_note: string | null;
  assignee: string | null;
  filed_at: string | null;
  notes: string | null;
}

export interface FilingView extends FilingRow {
  clientName: string;
  contactName: string | null;
  contactPhone: string | null;
  effectiveDue: string;
  daysLeft: number;
  risk: Risk;
  docsRequiredList: string[];
  docsReceivedList: string[];
  docsOutstanding: string[];
  exposure: number;
  lastChase: { stage: Stage; created_at: string } | null;
}

export type Risk = "FILED" | "OVERDUE" | "CRITICAL" | "AT_RISK" | "ON_TRACK" | "NA";

export const RISK_LABEL: Record<Risk, string> = {
  FILED: "Filed",
  OVERDUE: "Overdue",
  CRITICAL: "Critical",
  AT_RISK: "At risk",
  ON_TRACK: "On track",
  NA: "Not applicable",
};

export const RISK_ORDER: Risk[] = ["OVERDUE", "CRITICAL", "AT_RISK", "ON_TRACK", "FILED", "NA"];

// -------------------------------------------------------------- penalties

/**
 * Rough rupee exposure if this filing is missed. Deliberately conservative and
 * clearly an estimate - it exists to rank work, not to advise a client.
 * [fixed floor, per-day, cap]
 */
const PENALTY_MODEL: Record<string, [number, number, number]> = {
  GSTR1_M: [0, 50, 5000],
  GSTR3B_M: [0, 50, 5000],
  GSTR1_Q: [0, 50, 5000],
  GSTR3B_Q: [0, 50, 5000],
  CMP08: [0, 50, 5000],
  GSTR9: [0, 200, 20000],
  TDS_PAY: [0, 100, 50000],
  TDS_RETURN: [0, 200, 100000],
  ADV_TAX: [0, 150, 60000],
  ITR_NONAUDIT: [5000, 0, 5000],
  ITR_AUDIT: [5000, 0, 5000],
  TAX_AUDIT: [150000, 0, 150000],
  AOC4: [0, 100, 999999],
  MGT7: [0, 100, 999999],
  LLP11: [0, 100, 999999],
  LLP8: [0, 100, 999999],
  DIR3KYC: [5000, 0, 5000],
  PF_ECR: [0, 120, 60000],
  ESI: [0, 100, 50000],
  PT_TS: [0, 25, 5000],
};

/** Exposure today: fixed component always counts once past due, per-day accrues. */
export function estimateExposure(code: string, daysLate: number): number {
  const model = PENALTY_MODEL[code];
  if (!model) return 0;
  const [fixed, perDay, cap] = model;
  if (daysLate <= 0) {
    // not yet late - show the fixed floor as what is at stake
    return Math.min(fixed || perDay * 30, cap);
  }
  return Math.min(fixed + perDay * daysLate, cap);
}

// ----------------------------------------------------------------- helpers

export function todayISO(): string {
  return iso(new Date());
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISO).getTime();
  return Math.round((b - a) / 86400000);
}

export function toProfile(c: ClientRow): ClientProfile {
  return {
    id: c.id,
    name: c.name,
    entityType: c.entity_type,
    pan: c.pan,
    gstin: c.gstin,
    gstScheme: c.gst_scheme,
    tdsDeductor: !!c.tds_deductor,
    hasEmployees: !!c.has_employees,
    taxAudit: !!c.tax_audit,
    directorCount: c.director_count,
    state: c.state,
  };
}

export function riskOf(status: FilingStatus, daysLeft: number): Risk {
  if (status === "FILED") return "FILED";
  if (status === "NOT_APPLICABLE") return "NA";
  if (daysLeft < 0) return "OVERDUE";
  if (status === "AWAITING_DOCS") {
    if (daysLeft <= 3) return "CRITICAL";
    if (daysLeft <= 10) return "AT_RISK";
    return "ON_TRACK";
  }
  // documents are in, only preparation remains
  if (daysLeft <= 1) return "CRITICAL";
  if (daysLeft <= 3) return "AT_RISK";
  return "ON_TRACK";
}

// ------------------------------------------------------------------ firms

export function ensureFirm(name = "Vahi Demo & Associates", city = "Hyderabad") {
  const existing = get("SELECT id FROM firms WHERE id = ?", [FIRM_ID]);
  if (!existing) {
    run("INSERT INTO firms (id, name, city) VALUES (?, ?, ?)", [FIRM_ID, name, city]);
  }
  return get<{ id: string; name: string; city: string }>("SELECT * FROM firms WHERE id = ?", [FIRM_ID])!;
}

export function firm() {
  return ensureFirm();
}

// ---------------------------------------------------------------- clients

export function listClients(): ClientRow[] {
  return all<ClientRow>("SELECT * FROM clients WHERE firm_id = ? ORDER BY name", [FIRM_ID]);
}

export function getClient(id: string): ClientRow | undefined {
  return get<ClientRow>("SELECT * FROM clients WHERE id = ?", [id]);
}

export interface ClientInput {
  name: string;
  entityType: EntityType;
  pan?: string | null;
  gstin?: string | null;
  gstScheme: GstScheme;
  tdsDeductor: boolean;
  hasEmployees: boolean;
  taxAudit: boolean;
  directorCount: number;
  state: string;
  contactName?: string | null;
  contactPhone?: string | null;
}

export function createClient(input: ClientInput): string {
  const id = uid("cli");
  run(
    `INSERT INTO clients
      (id, firm_id, name, entity_type, pan, gstin, gst_scheme, tds_deductor,
       has_employees, tax_audit, director_count, state, contact_name, contact_phone)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      FIRM_ID,
      input.name,
      input.entityType,
      input.pan ?? null,
      input.gstin ?? null,
      input.gstScheme,
      input.tdsDeductor ? 1 : 0,
      input.hasEmployees ? 1 : 0,
      input.taxAudit ? 1 : 0,
      input.directorCount,
      input.state,
      input.contactName ?? null,
      input.contactPhone ?? null,
    ],
  );
  return id;
}

export function updateClient(id: string, input: ClientInput) {
  run(
    `UPDATE clients SET name=?, entity_type=?, pan=?, gstin=?, gst_scheme=?,
       tds_deductor=?, has_employees=?, tax_audit=?, director_count=?, state=?,
       contact_name=?, contact_phone=? WHERE id=?`,
    [
      input.name,
      input.entityType,
      input.pan ?? null,
      input.gstin ?? null,
      input.gstScheme,
      input.tdsDeductor ? 1 : 0,
      input.hasEmployees ? 1 : 0,
      input.taxAudit ? 1 : 0,
      input.directorCount,
      input.state,
      input.contactName ?? null,
      input.contactPhone ?? null,
      id,
    ],
  );
}

export function deleteClient(id: string) {
  run("DELETE FROM clients WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- filings

/**
 * Expand the rules engine for one client into the filings table. Idempotent:
 * existing rows keep their status, docs and notes. Rows whose obligation no
 * longer applies are removed only when untouched.
 */
export function syncClientFilings(clientId: string, fromISO: string, toISO: string): number {
  const client = getClient(clientId);
  if (!client) return 0;
  const occurrences = generateOccurrences(toProfile(client), fromISO, toISO);
  let created = 0;
  for (const o of occurrences) {
    const existing = get<{ id: string }>(
      "SELECT id FROM filings WHERE client_id=? AND obligation_code=? AND period_key=?",
      [clientId, o.obligationCode, o.periodKey],
    );
    if (existing) continue;
    run(
      `INSERT INTO filings
        (id, client_id, obligation_code, title, category, authority, period_key,
         period_label, due_date, docs_required, penalty_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uid("fil"),
        clientId,
        o.obligationCode,
        o.title,
        o.category,
        o.authority,
        o.periodKey,
        o.periodLabel,
        o.dueDate,
        JSON.stringify(o.docsRequired),
        o.penaltyNote,
      ],
    );
    created++;
  }
  // drop untouched filings for obligations that no longer apply
  const validCodes = new Set(occurrences.map((o) => o.obligationCode));
  const stale = all<{ id: string; obligation_code: string }>(
    `SELECT id, obligation_code FROM filings
      WHERE client_id=? AND status='AWAITING_DOCS' AND docs_received='[]'`,
    [clientId],
  );
  for (const s of stale) {
    if (!validCodes.has(s.obligation_code)) run("DELETE FROM filings WHERE id=?", [s.id]);
  }
  return created;
}

export function syncAllFilings(fromISO: string, toISO: string): number {
  let n = 0;
  for (const c of listClients()) n += syncClientFilings(c.id, fromISO, toISO);
  return n;
}

function hydrate(row: FilingRow & { clientName: string; contactName: string | null; contactPhone: string | null }): FilingView {
  const effectiveDue = row.extended_due || row.due_date;
  const daysLeft = daysBetween(todayISO(), effectiveDue);
  const docsRequiredList: string[] = JSON.parse(row.docs_required || "[]");
  const docsReceivedList: string[] = JSON.parse(row.docs_received || "[]");
  const docsOutstanding = docsRequiredList.filter((d) => !docsReceivedList.includes(d));
  const risk = riskOf(row.status, daysLeft);
  const lastChase =
    get<{ stage: Stage; created_at: string }>(
      "SELECT stage, created_at FROM messages WHERE filing_id=? ORDER BY created_at DESC LIMIT 1",
      [row.id],
    ) ?? null;
  return {
    ...row,
    effectiveDue,
    daysLeft,
    risk,
    docsRequiredList,
    docsReceivedList,
    docsOutstanding,
    exposure: risk === "FILED" || risk === "NA" ? 0 : estimateExposure(row.obligation_code, -daysLeft),
    lastChase,
  };
}

const FILING_SELECT = `
  SELECT f.*, c.name AS clientName, c.contact_name AS contactName, c.contact_phone AS contactPhone
    FROM filings f JOIN clients c ON c.id = f.client_id
   WHERE c.firm_id = ?`;

export function listFilings(opts: {
  clientId?: string;
  from?: string;
  to?: string;
  status?: FilingStatus;
  category?: Category;
  limit?: number;
} = {}): FilingView[] {
  const where: string[] = [];
  const params: unknown[] = [FIRM_ID];
  if (opts.clientId) {
    where.push("f.client_id = ?");
    params.push(opts.clientId);
  }
  if (opts.from) {
    where.push("COALESCE(f.extended_due, f.due_date) >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    where.push("COALESCE(f.extended_due, f.due_date) <= ?");
    params.push(opts.to);
  }
  if (opts.status) {
    where.push("f.status = ?");
    params.push(opts.status);
  }
  if (opts.category) {
    where.push("f.category = ?");
    params.push(opts.category);
  }
  const sql =
    FILING_SELECT +
    (where.length ? " AND " + where.join(" AND ") : "") +
    " ORDER BY COALESCE(f.extended_due, f.due_date) ASC" +
    (opts.limit ? " LIMIT " + Number(opts.limit) : "");
  return all<FilingRow & { clientName: string; contactName: string | null; contactPhone: string | null }>(
    sql,
    params,
  ).map(hydrate);
}

export function getFiling(id: string): FilingView | undefined {
  const row = get<FilingRow & { clientName: string; contactName: string | null; contactPhone: string | null }>(
    FILING_SELECT + " AND f.id = ?",
    [FIRM_ID, id],
  );
  return row ? hydrate(row) : undefined;
}

export function setFilingStatus(id: string, status: FilingStatus) {
  run("UPDATE filings SET status=?, filed_at=CASE WHEN ?='FILED' THEN datetime('now') ELSE NULL END WHERE id=?", [
    status,
    status,
    id,
  ]);
}

export function toggleDocReceived(filingId: string, doc: string) {
  const row = get<{ docs_received: string; docs_required: string }>(
    "SELECT docs_received, docs_required FROM filings WHERE id=?",
    [filingId],
  );
  if (!row) return;
  const received: string[] = JSON.parse(row.docs_received || "[]");
  const required: string[] = JSON.parse(row.docs_required || "[]");
  const next = received.includes(doc) ? received.filter((d) => d !== doc) : [...received, doc];
  const allIn = required.every((d) => next.includes(d));
  run("UPDATE filings SET docs_received=?, status=CASE WHEN status IN ('AWAITING_DOCS','DOCS_RECEIVED') THEN ? ELSE status END WHERE id=?", [
    JSON.stringify(next),
    allIn && next.length > 0 ? "DOCS_RECEIVED" : "AWAITING_DOCS",
    filingId,
  ]);
}

export function setExtendedDue(filingId: string, date: string | null) {
  run("UPDATE filings SET extended_due=? WHERE id=?", [date, filingId]);
}

// ----------------------------------------------------------------- chases

/** Which chase stage is due for this filing right now, if any. */
export function dueStage(f: FilingView): Stage | null {
  if (f.status === "FILED" || f.status === "NOT_APPLICABLE") return null;
  if (f.docsOutstanding.length === 0) return null;
  const order: Stage[] = ["T10", "T5", "T2", "T1", "OVERDUE"];
  let candidate: Stage | null = null;
  for (const s of order) {
    const offset = STAGE_OFFSET[s];
    if (s === "OVERDUE") {
      if (f.daysLeft < 0) candidate = s;
    } else if (f.daysLeft <= offset) {
      candidate = s;
    }
  }
  if (!candidate) return null;
  const alreadySent = get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE filing_id=? AND stage=?", [
    f.id,
    candidate,
  ]);
  if (alreadySent && alreadySent.n > 0) return null;
  return candidate;
}

/** How far back an overdue filing still gets auto-chased. Older than this is a
 *  conversation for a partner to have, not a template message. */
export const CHASE_LOOKBACK_DAYS = 45;

export function pendingChases(): Array<{ filing: FilingView; stage: Stage }> {
  const out: Array<{ filing: FilingView; stage: Stage }> = [];
  const today = todayISO();
  for (const f of listFilings({ from: addDays(today, -CHASE_LOOKBACK_DAYS), to: addDays(today, 12) })) {
    const stage = dueStage(f);
    if (stage) out.push({ filing: f, stage });
  }
  return out.sort((a, b) => a.filing.effectiveDue.localeCompare(b.filing.effectiveDue));
}

export function recordMessage(filingId: string, clientId: string, stage: Stage, body: string, status: string) {
  run(
    "INSERT INTO messages (id, filing_id, client_id, stage, body, status, sent_at) VALUES (?,?,?,?,?,?,datetime('now'))",
    [uid("msg"), filingId, clientId, stage, body, status],
  );
}

export function listMessages(filingId: string) {
  return all<{ id: string; stage: Stage; body: string; status: string; sent_at: string }>(
    "SELECT id, stage, body, status, sent_at FROM messages WHERE filing_id=? ORDER BY created_at DESC",
    [filingId],
  );
}

export function recentMessages(limit = 40) {
  return all<{
    id: string;
    stage: Stage;
    body: string;
    status: string;
    sent_at: string;
    clientName: string;
    title: string;
  }>(
    `SELECT m.id, m.stage, m.body, m.status, m.sent_at, c.name AS clientName, f.title
       FROM messages m
       JOIN clients c ON c.id = m.client_id
       JOIN filings f ON f.id = m.filing_id
      WHERE c.firm_id = ?
      ORDER BY m.created_at DESC LIMIT ?`,
    [FIRM_ID, limit],
  );
}

// -------------------------------------------------------------- dashboard

export function addDays(dateISO: string, n: number): string {
  const d = parseISO(dateISO);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export interface Dashboard {
  today: string;
  clientCount: number;
  buckets: Record<Risk, FilingView[]>;
  exposure: number;
  next30: FilingView[];
  chasesDue: number;
  filedThisMonth: number;
  byCategory: Array<{ category: Category; open: number; overdue: number }>;
}

export function dashboard(): Dashboard {
  const today = todayISO();
  const horizon = addDays(today, 45);
  const rows = listFilings({ from: addDays(today, -400), to: horizon });
  const buckets: Record<Risk, FilingView[]> = {
    OVERDUE: [],
    CRITICAL: [],
    AT_RISK: [],
    ON_TRACK: [],
    FILED: [],
    NA: [],
  };
  for (const r of rows) buckets[r.risk].push(r);

  const open = rows.filter((r) => r.risk !== "FILED" && r.risk !== "NA");
  const exposure = open.reduce((s, r) => s + r.exposure, 0);

  const cats = new Map<Category, { open: number; overdue: number }>();
  for (const r of open) {
    const c = cats.get(r.category) ?? { open: 0, overdue: 0 };
    c.open++;
    if (r.risk === "OVERDUE") c.overdue++;
    cats.set(r.category, c);
  }

  const monthStart = today.slice(0, 7) + "-01";
  const filedThisMonth = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM filings f JOIN clients c ON c.id=f.client_id
      WHERE c.firm_id=? AND f.status='FILED' AND f.filed_at >= ?`,
    [FIRM_ID, monthStart],
  );

  return {
    today,
    clientCount: listClients().length,
    buckets,
    exposure,
    next30: rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30 && r.risk !== "FILED" && r.risk !== "NA"),
    chasesDue: pendingChases().length,
    filedThisMonth: filedThisMonth?.n ?? 0,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.open - a.open),
  };
}
