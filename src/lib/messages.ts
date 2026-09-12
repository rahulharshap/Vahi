import { q, one, exec, uid, nowISO } from "./db";
import {
  defaultTemplate,
  render,
  type TemplateChannel,
  type TemplateVars,
} from "./templates";
import type { Stage } from "./whatsapp";
import { replyAddress, INTAKE_DOMAIN } from "./intake";

/**
 * Composing a chase from a firm's templates.
 *
 * Wording comes from message_templates when the firm has overridden it and
 * from the built-in defaults otherwise. The substituted values do not: the
 * document list, the due date and the penalty text come from the rules engine,
 * so a firm can change how a message reads but never what it claims.
 */

export const STAGES: Stage[] = ["T10", "T5", "T2", "T1", "OVERDUE"];

export interface TemplateRow {
  id: string;
  firm_id: string;
  channel: TemplateChannel;
  stage: Stage;
  subject: string | null;
  body: string;
  updated_at: string;
}

export interface ResolvedTemplate {
  channel: TemplateChannel;
  stage: Stage;
  subject: string | null;
  body: string;
  /** false when this is the built-in default rather than a firm's override */
  customised: boolean;
}

export async function listTemplates(firmId: string): Promise<ResolvedTemplate[]> {
  const rows = await q<TemplateRow>("SELECT * FROM message_templates WHERE firm_id = ?", [firmId]);
  const byKey = new Map(rows.map((r) => [r.channel + ":" + r.stage, r]));
  const out: ResolvedTemplate[] = [];
  for (const channel of ["WHATSAPP", "EMAIL"] as TemplateChannel[]) {
    for (const stage of STAGES) {
      const row = byKey.get(channel + ":" + stage);
      const fallback = defaultTemplate(channel, stage);
      out.push({
        channel,
        stage,
        subject: row ? row.subject : fallback.subject,
        body: row ? row.body : fallback.body,
        customised: Boolean(row),
      });
    }
  }
  return out;
}

export async function getTemplate(
  firmId: string,
  channel: TemplateChannel,
  stage: Stage,
): Promise<ResolvedTemplate> {
  const row = await one<TemplateRow>(
    "SELECT * FROM message_templates WHERE firm_id = ? AND channel = ? AND stage = ?",
    [firmId, channel, stage],
  );
  const fallback = defaultTemplate(channel, stage);
  return {
    channel,
    stage,
    subject: row ? row.subject : fallback.subject,
    body: row ? row.body : fallback.body,
    customised: Boolean(row),
  };
}

export async function saveTemplate(
  firmId: string,
  channel: TemplateChannel,
  stage: Stage,
  input: { subject: string | null; body: string },
): Promise<void> {
  const body = input.body.trim();
  // An empty body would send an empty message. Saving nothing is how a firm
  // asks to go back to the default, so treat it as a reset rather than an error.
  if (!body) return resetTemplate(firmId, channel, stage);
  await exec(
    `INSERT INTO message_templates (id, firm_id, channel, stage, subject, body, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (firm_id, channel, stage)
     DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
    [uid("tpl"), firmId, channel, stage, input.subject, body, nowISO()],
  );
}

export async function resetTemplate(
  firmId: string,
  channel: TemplateChannel,
  stage: Stage,
): Promise<void> {
  await exec("DELETE FROM message_templates WHERE firm_id = ? AND channel = ? AND stage = ?", [
    firmId,
    channel,
    stage,
  ]);
}

// ---------------------------------------------------------------- composing

export interface ChaseFacts {
  clientName: string;
  contactName: string | null;
  filingTitle: string;
  periodLabel: string;
  dueDate: string;
  docsOutstanding: string[];
  penaltyNote: string | null;
  firmName: string;
  filingId: string;
  intakeDomain?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return d + " " + MONTHS[m - 1] + " " + y;
}

export function varsFor(facts: ChaseFacts, channel: TemplateChannel): TemplateVars {
  return {
    contact: facts.contactName || facts.clientName,
    client: facts.clientName,
    filing: facts.filingTitle,
    period: facts.periodLabel,
    dueDate: prettyDate(facts.dueDate),
    documents: facts.docsOutstanding.map((d) => "  - " + d).join("\n"),
    documentCount:
      facts.docsOutstanding.length +
      (facts.docsOutstanding.length === 1 ? " document" : " documents"),
    penalty: facts.penaltyNote ?? "a late fee applies once the statutory date passes",
    firm: facts.firmName,
    replyAddress: channel === "EMAIL" ? replyAddress(facts.filingId) : "",
  };
}

export async function composeFromTemplate(
  firmId: string,
  channel: TemplateChannel,
  stage: Stage,
  facts: ChaseFacts,
): Promise<{ subject: string | null; body: string }> {
  const template = await getTemplate(firmId, channel, stage);
  const vars = varsFor(facts, channel);
  return {
    subject: template.subject ? render(template.subject, vars) : null,
    body: render(template.body, vars),
  };
}

/** Preview without touching the database — used by the template editor. */
export function previewTemplate(
  template: { subject: string | null; body: string },
  channel: TemplateChannel,
): { subject: string | null; body: string } {
  const sample: ChaseFacts = {
    clientName: "Sri Lakshmi Traders",
    contactName: "Ravi Kumar",
    filingTitle: "GSTR-3B (summary return and tax payment)",
    periodLabel: "Aug 2026",
    dueDate: "2026-09-20",
    docsOutstanding: [
      "Sales register / outward invoices",
      "Purchase register / inward invoices",
      "Bank statement for the period",
    ],
    penaltyNote: "Late fee plus 18% p.a. interest on unpaid tax.",
    firmName: "Rao & Associates",
    filingId: "fil_example",
    intakeDomain: INTAKE_DOMAIN,
  };
  const vars = varsFor(sample, channel);
  return {
    subject: template.subject ? render(template.subject, vars) : null,
    body: render(template.body, vars),
  };
}
