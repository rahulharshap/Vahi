import { q, one, exec, uid, nowISO, insertMany, deleteByIds, driver } from "./db";
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
  tds_deductor: boolean | number;
  has_employees: boolean | number;
  tax_audit: boolean | number;
  director_count: number;
  state: string;
  contact_name: string | null;
  contact_phone: string | null;
  active: boolean | number;
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

type JoinedFilingRow = FilingRow & {
  clientname: string;
  contactname: string | null;
  contactphone: string | null;
};

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
  stagesSent: Stage[];
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

// -------------------------------------------------------------- penalties

/**
 * Rough rupee exposure if a filing is missed. Deliberately conservative and
 * clearly an estimate — it ranks work, it does not advise a client.
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

export function estimateExposure(code: string, daysLate: number): number {
  const model = PENALTY_MODEL[code];
  if (!model) return 0;
  const [fixed, perDay, cap] = model;
  if (daysLate <= 0) return Math.min(fixed || perDay * 30, cap);
  return Math.min(fixed + perDay * daysLate, cap);
}

// ----------------------------------------------------------------- helpers

export function todayISO(): string {
  return iso(new Date());
}

export function addDays(dateISO: string, n: number): string {
  const d = parseISO(dateISO);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86400000);
}

/** Postgres `date` and SQLite TEXT both arrive as strings; normalise the tail. */
function dateOnly(v: string | null): string | null {
  return v ? String(v).slice(0, 10) : null;
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
  if (daysLeft <= 1) return "CRITICAL";
  if (daysLeft <= 3) return "AT_RISK";
  return "ON_TRACK";
}

// ------------------------------------------------------------------ firms

export async function ensureFirm(name = "Rao & Associates, Chartered Accountants", city = "Hyderabad") {
  const existing = await one<{ id: string }>("SELECT id FROM firms WHERE id = ?", [FIRM_ID]);
  if (!existing) {
    await exec("INSERT INTO firms (id, name, city, created_at) VALUES (?, ?, ?, ?)", [
      FIRM_ID,
      name,
      city,
      nowISO(),
    ]);
  }
  return (await one<{ id: string; name: string; city: string }>("SELECT * FROM firms WHERE id = ?", [
    FIRM_ID,
  ]))!;
}

export const firm = ensureFirm;

export const DEFAULT_FIRM = { id: FIRM_ID, name: "Vahi", city: "" };

/**
 * Firm details for chrome that renders on every page, including during the
 * production build's prerender of /_not-found and other static routes.
 *
 * The build machine often cannot reach the database — no env vars, no
 * network path, or simply a database that does not exist yet — and a header
 * is not worth failing a deploy over. Anything that actually needs the
 * database uses ensureFirm() and is allowed to fail loudly.
 */
export async function firmSafe(): Promise<{ id: string; name: string; city: string }> {
  try {
    return await ensureFirm();
  } catch {
    return DEFAULT_FIRM;
  }
}

// ---------------------------------------------------------------- clients

export async function listClients(): Promise<ClientRow[]> {
  return q<ClientRow>("SELECT * FROM clients WHERE firm_id = ? ORDER BY name", [FIRM_ID]);
}

export async function getClient(id: string): Promise<ClientRow | undefined> {
  return one<ClientRow>("SELECT * FROM clients WHERE id = ?", [id]);
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

export async function createClient(input: ClientInput): Promise<string> {
  const id = uid("cli");
  await exec(
    `INSERT INTO clients
      (id, firm_id, name, entity_type, pan, gstin, gst_scheme, tds_deductor,
       has_employees, tax_audit, director_count, state, contact_name, contact_phone, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      FIRM_ID,
      input.name,
      input.entityType,
      input.pan ?? null,
      input.gstin ?? null,
      input.gstScheme,
      input.tdsDeductor,
      input.hasEmployees,
      input.taxAudit,
      input.directorCount,
      input.state,
      input.contactName ?? null,
      input.contactPhone ?? null,
      nowISO(),
    ],
  );
  return id;
}

export async function updateClient(id: string, input: ClientInput): Promise<void> {
  await exec(
    `UPDATE clients SET name=?, entity_type=?, pan=?, gstin=?, gst_scheme=?,
       tds_deductor=?, has_employees=?, tax_audit=?, director_count=?, state=?,
       contact_name=?, contact_phone=? WHERE id=?`,
    [
      input.name,
      input.entityType,
      input.pan ?? null,
      input.gstin ?? null,
      input.gstScheme,
      input.tdsDeductor,
      input.hasEmployees,
      input.taxAudit,
      input.directorCount,
      input.state,
      input.contactName ?? null,
      input.contactPhone ?? null,
      id,
    ],
  );
}

export async function deleteClient(id: string): Promise<void> {
  await exec("DELETE FROM clients WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- filings

/**
 * Expand the rules engine for one client into the filings table. Idempotent:
 * existing rows keep their status, documents and notes. Rows whose obligation
 * no longer applies are removed only when untouched.
 */
export async function syncClientFilings(clientId: string, fromISO: string, toISO: string): Promise<number> {
  const client = await getClient(clientId);
  if (!client) return 0;
  const occurrences = generateOccurrences(toProfile(client), fromISO, toISO);

  const existing = await q<{ obligation_code: string; period_key: string }>(
    "SELECT obligation_code, period_key FROM filings WHERE client_id = ?",
    [clientId],
  );
  const have = new Set(existing.map((e) => e.obligation_code + "|" + e.period_key));

  const ts = nowISO();
  const fresh = occurrences.filter((o) => !have.has(o.obligationCode + "|" + o.periodKey));
  const created = await insertMany(
    "filings",
    ["id", "client_id", "obligation_code", "title", "category", "authority",
     "period_key", "period_label", "due_date", "docs_required", "penalty_note", "created_at"],
    fresh.map((o) => [
      uid("fil"), clientId, o.obligationCode, o.title, o.category, o.authority,
      o.periodKey, o.periodLabel, o.dueDate, JSON.stringify(o.docsRequired), o.penaltyNote, ts,
    ]),
  );

  // drop untouched filings for obligations that no longer apply
  const validCodes = new Set(occurrences.map((o) => o.obligationCode));
  const stale = await q<{ id: string; obligation_code: string }>(
    `SELECT id, obligation_code FROM filings
      WHERE client_id=? AND status='AWAITING_DOCS' AND docs_received='[]'`,
    [clientId],
  );
  await deleteByIds(
    "filings",
    stale.filter((r) => !validCodes.has(r.obligation_code)).map((r) => r.id),
  );
  return created;
}

export async function syncAllFilings(fromISO: string, toISO: string): Promise<number> {
  let n = 0;
  for (const c of await listClients()) n += await syncClientFilings(c.id, fromISO, toISO);
  return n;
}

const FILING_SELECT = `
  SELECT f.*, c.name AS clientname, c.contact_name AS contactname, c.contact_phone AS contactphone
    FROM filings f JOIN clients c ON c.id = f.client_id
   WHERE c.firm_id = ?`;

/**
 * Attach chase history to a page of filings in one query rather than one per
 * row. Over a pooled network connection the N+1 version cost seconds.
 */
async function attachChases(rows: JoinedFilingRow[]): Promise<Map<string, { stages: Stage[]; last: { stage: Stage; created_at: string } | null }>> {
  const map = new Map<string, { stages: Stage[]; last: { stage: Stage; created_at: string } | null }>();
  if (rows.length === 0) return map;
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const msgs = await q<{ filing_id: string; stage: Stage; created_at: string }>(
    `SELECT filing_id, stage, created_at FROM messages
      WHERE filing_id IN (${placeholders}) ORDER BY created_at ASC`,
    ids,
  );
  for (const m of msgs) {
    const entry = map.get(m.filing_id) ?? { stages: [], last: null };
    entry.stages.push(m.stage);
    entry.last = { stage: m.stage, created_at: String(m.created_at) };
    map.set(m.filing_id, entry);
  }
  return map;
}

function hydrate(
  row: JoinedFilingRow,
  chases: Map<string, { stages: Stage[]; last: { stage: Stage; created_at: string } | null }>,
  today: string,
): FilingView {
  const dueDate = dateOnly(row.due_date)!;
  const extendedDue = dateOnly(row.extended_due);
  const effectiveDue = extendedDue || dueDate;
  const daysLeft = daysBetween(today, effectiveDue);
  const docsRequiredList: string[] = JSON.parse(row.docs_required || "[]");
  const docsReceivedList: string[] = JSON.parse(row.docs_received || "[]");
  const docsOutstanding = docsRequiredList.filter((d) => !docsReceivedList.includes(d));
  const risk = riskOf(row.status, daysLeft);
  const chase = chases.get(row.id);
  return {
    ...row,
    due_date: dueDate,
    extended_due: extendedDue,
    clientName: row.clientname,
    contactName: row.contactname,
    contactPhone: row.contactphone,
    effectiveDue,
    daysLeft,
    risk,
    docsRequiredList,
    docsReceivedList,
    docsOutstanding,
    exposure: risk === "FILED" || risk === "NA" ? 0 : estimateExposure(row.obligation_code, -daysLeft),
    stagesSent: chase?.stages ?? [],
    lastChase: chase?.last ?? null,
  };
}

export async function listFilings(
  opts: {
    clientId?: string;
    from?: string;
    to?: string;
    status?: FilingStatus;
    category?: Category;
    /** exclude FILED and NOT_APPLICABLE in SQL rather than in JS */
    openOnly?: boolean;
    limit?: number;
  } = {},
): Promise<FilingView[]> {
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
  if (opts.openOnly) {
    where.push("f.status NOT IN ('FILED','NOT_APPLICABLE')");
  }
  const sql =
    FILING_SELECT +
    (where.length ? " AND " + where.join(" AND ") : "") +
    " ORDER BY COALESCE(f.extended_due, f.due_date) ASC" +
    (opts.limit ? " LIMIT " + Number(opts.limit) : "");
  const rows = await q<JoinedFilingRow>(sql, params);
  const chases = await attachChases(rows);
  const today = todayISO();
  return rows.map((r) => hydrate(r, chases, today));
}

export async function getFiling(id: string): Promise<FilingView | undefined> {
  const row = await one<JoinedFilingRow>(FILING_SELECT + " AND f.id = ?", [FIRM_ID, id]);
  if (!row) return undefined;
  const chases = await attachChases([row]);
  return hydrate(row, chases, todayISO());
}

export async function setFilingStatus(id: string, status: FilingStatus): Promise<void> {
  await exec("UPDATE filings SET status=?, filed_at=? WHERE id=?", [
    status,
    status === "FILED" ? nowISO() : null,
    id,
  ]);
}

export async function toggleDocReceived(filingId: string, doc: string): Promise<void> {
  const row = await one<{ docs_received: string; docs_required: string }>(
    "SELECT docs_received, docs_required FROM filings WHERE id=?",
    [filingId],
  );
  if (!row) return;
  const received: string[] = JSON.parse(row.docs_received || "[]");
  const required: string[] = JSON.parse(row.docs_required || "[]");
  const next = received.includes(doc) ? received.filter((d) => d !== doc) : [...received, doc];
  const allIn = required.length > 0 && required.every((d) => next.includes(d));
  await exec(
    `UPDATE filings SET docs_received=?,
       status = CASE WHEN status IN ('AWAITING_DOCS','DOCS_RECEIVED') THEN ? ELSE status END
     WHERE id=?`,
    [JSON.stringify(next), allIn ? "DOCS_RECEIVED" : "AWAITING_DOCS", filingId],
  );
}

export async function setExtendedDue(filingId: string, date: string | null): Promise<void> {
  await exec("UPDATE filings SET extended_due=? WHERE id=?", [date, filingId]);
}

// ----------------------------------------------------------------- chases

/** How far back an overdue filing still gets auto-chased. Older than this is a
 *  conversation for a partner to have, not a template message. */
export const CHASE_LOOKBACK_DAYS = 45;

/** Which chase stage is due for this filing right now, if any. Pure. */
export function dueStage(f: FilingView): Stage | null {
  if (f.status === "FILED" || f.status === "NOT_APPLICABLE") return null;
  if (f.docsOutstanding.length === 0) return null;
  const order: Stage[] = ["T10", "T5", "T2", "T1", "OVERDUE"];
  let candidate: Stage | null = null;
  for (const s of order) {
    if (s === "OVERDUE") {
      if (f.daysLeft < 0) candidate = s;
    } else if (f.daysLeft <= STAGE_OFFSET[s]) {
      candidate = s;
    }
  }
  if (!candidate) return null;
  return f.stagesSent.includes(candidate) ? null : candidate;
}

export async function pendingChases(): Promise<Array<{ filing: FilingView; stage: Stage }>> {
  const today = todayISO();
  const rows = await listFilings({ from: addDays(today, -CHASE_LOOKBACK_DAYS), to: addDays(today, 12) });
  const out: Array<{ filing: FilingView; stage: Stage }> = [];
  for (const f of rows) {
    const stage = dueStage(f);
    if (stage) out.push({ filing: f, stage });
  }
  return out.sort((a, b) => a.filing.effectiveDue.localeCompare(b.filing.effectiveDue));
}

export async function recordMessage(
  filingId: string,
  clientId: string,
  stage: Stage,
  body: string,
  status: string,
): Promise<void> {
  const ts = nowISO();
  await exec(
    "INSERT INTO messages (id, filing_id, client_id, stage, body, status, sent_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [uid("msg"), filingId, clientId, stage, body, status, ts, ts],
  );
}

export async function listMessages(filingId: string) {
  return q<{ id: string; stage: Stage; body: string; status: string; sent_at: string }>(
    "SELECT id, stage, body, status, sent_at FROM messages WHERE filing_id=? ORDER BY created_at DESC",
    [filingId],
  );
}

export async function recentMessages(limit = 40) {
  return q<{
    id: string;
    stage: Stage;
    status: string;
    sent_at: string;
    clientname: string;
    title: string;
  }>(
    `SELECT m.id, m.stage, m.status, m.sent_at, c.name AS clientname, f.title
       FROM messages m
       JOIN clients c ON c.id = m.client_id
       JOIN filings f ON f.id = m.filing_id
      WHERE c.firm_id = ?
      ORDER BY m.created_at DESC LIMIT ?`,
    [FIRM_ID, limit],
  );
}

// -------------------------------------------------------------- dashboard

/** How far back the board reaches. Older overdue items live on the client
 *  page and the calendar; surfacing year-old misses on the board is noise. */
export const BOARD_LOOKBACK_DAYS = 120;

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

export async function dashboard(): Promise<Dashboard> {
  const today = todayISO();
  const rows = await listFilings({ from: addDays(today, -BOARD_LOOKBACK_DAYS), to: addDays(today, 45) });

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

  // chases are computable from the rows already loaded, no second round trip
  const lookback = addDays(today, -CHASE_LOOKBACK_DAYS);
  const horizon = addDays(today, 12);
  const chasesDue = rows.filter(
    (f) => f.effectiveDue >= lookback && f.effectiveDue <= horizon && dueStage(f) !== null,
  ).length;

  const monthStart = today.slice(0, 7) + "-01";
  const filedRow = await one<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM filings f JOIN clients c ON c.id=f.client_id
      WHERE c.firm_id=? AND f.status='FILED' AND f.filed_at >= ?`,
    [FIRM_ID, monthStart],
  );
  const clientRow = await one<{ n: number | string }>(
    "SELECT COUNT(*) AS n FROM clients WHERE firm_id = ?",
    [FIRM_ID],
  );

  return {
    today,
    clientCount: Number(clientRow?.n ?? 0),
    buckets,
    exposure,
    next30: rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30 && r.risk !== "FILED" && r.risk !== "NA"),
    chasesDue,
    filedThisMonth: Number(filedRow?.n ?? 0),
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.open - a.open),
  };
}


// ------------------------------------------------------- client roster view

export interface ClientSummary {
  client: ClientRow;
  open: number;
  overdue: number;
  exposure: number;
  worst: Risk;
  next: { title: string; effectiveDue: string } | null;
}

/**
 * Roster with per-client counts in two queries rather than one query per
 * client. The N+1 version issued 52 round trips and took four seconds against
 * Supabase.
 */
export async function clientSummaries(): Promise<ClientSummary[]> {
  const clients = await listClients();
  if (clients.length === 0) return [];
  const today = todayISO();

  const rows = await q<{
    client_id: string;
    obligation_code: string;
    status: FilingStatus;
    title: string;
    effective_due: string;
  }>(
    `SELECT f.client_id, f.obligation_code, f.status, f.title,
            COALESCE(f.extended_due, f.due_date) AS effective_due
       FROM filings f JOIN clients c ON c.id = f.client_id
      WHERE c.firm_id = ?
        AND f.status NOT IN ('FILED','NOT_APPLICABLE')
        AND COALESCE(f.extended_due, f.due_date) >= ?
      ORDER BY COALESCE(f.extended_due, f.due_date) ASC`,
    [FIRM_ID, addDays(today, -BOARD_LOOKBACK_DAYS)],
  );

  const byClient = new Map<string, ClientSummary>();
  for (const c of clients) {
    byClient.set(c.id, { client: c, open: 0, overdue: 0, exposure: 0, worst: "ON_TRACK", next: null });
  }
  const severity: Record<Risk, number> = { OVERDUE: 5, CRITICAL: 4, AT_RISK: 3, ON_TRACK: 2, FILED: 1, NA: 0 };

  for (const r of rows) {
    const entry = byClient.get(r.client_id);
    if (!entry) continue;
    const due = String(r.effective_due).slice(0, 10);
    const daysLeft = daysBetween(today, due);
    const risk = riskOf(r.status, daysLeft);
    entry.open++;
    if (risk === "OVERDUE") entry.overdue++;
    entry.exposure += estimateExposure(r.obligation_code, -daysLeft);
    if (severity[risk] > severity[entry.worst]) entry.worst = risk;
    if (!entry.next && daysLeft >= 0) entry.next = { title: r.title, effectiveDue: due };
  }

  return [...byClient.values()].sort(
    (a, b) => b.overdue - a.overdue || b.exposure - a.exposure || a.client.name.localeCompare(b.client.name),
  );
}

/**
 * Apply per-row status/docs/filed_at updates in chunked statements.
 *
 * Used by the seeder to backfill ~1,700 filings into believable states. One
 * UPDATE per row is a round trip per row; a CASE over an id list does a
 * chunk at a time.
 */
export async function bulkUpdateFilings(
  updates: Array<{ id: string; status: FilingStatus; docsReceived: string; filedAt: string | null }>,
  chunkSize = 150,
): Promise<number> {
  // Postgres needs the CASE result cast to match the timestamptz column;
  // SQLite stores it as text and must not see the cast.
  const tsCast = driver === "postgres" ? "::timestamptz" : "";
  let n = 0;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const caseFor = (expr: string) => "CASE id " + chunk.map(() => "WHEN ? THEN " + expr).join(" ") + " END";
    const params: unknown[] = [];
    for (const u of chunk) params.push(u.id, u.status);
    for (const u of chunk) params.push(u.id, u.docsReceived);
    for (const u of chunk) params.push(u.id, u.filedAt);
    for (const u of chunk) params.push(u.id);
    await exec(
      "UPDATE filings SET status = " + caseFor("?") +
        ", docs_received = " + caseFor("?") +
        ", filed_at = " + caseFor("?" + tsCast) +
        " WHERE id IN (" + chunk.map(() => "?").join(",") + ")",
      params,
    );
    n += chunk.length;
  }
  return n;
}
