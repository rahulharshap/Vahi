import type { Stage } from "./whatsapp";

/**
 * Message wording, as data.
 *
 * Every firm has its own voice, and a template a firm cannot edit is a
 * template they will work around — by sending manually, which is the thing
 * this product exists to stop. So the wording lives in message_templates,
 * keyed by (firm, channel, stage).
 *
 * These are the defaults. A firm that changes nothing gets exactly what was
 * hardcoded before; a row in the table overrides one stage on one channel and
 * leaves the rest alone.
 *
 * What is NOT templatable: which documents are named, when a stage fires, and
 * the statutory penalty text. Those come from the rules engine, because a firm
 * editing "GSTR-3B is due on the 20th" turns a correctness guarantee into a
 * support ticket.
 */

export type TemplateChannel = "WHATSAPP" | "EMAIL";

export interface TemplateVars {
  /** Contact person, falling back to the client's name */
  contact: string;
  client: string;
  filing: string;
  period: string;
  dueDate: string;
  /** Bulleted list of the documents still outstanding */
  documents: string;
  documentCount: string;
  penalty: string;
  firm: string;
  /** Email only; empty string on WhatsApp */
  replyAddress: string;
}

export const TEMPLATE_VARIABLES: Array<{ name: keyof TemplateVars; describes: string }> = [
  { name: "contact", describes: "Contact person, or the client name if none" },
  { name: "client", describes: "Client business name" },
  { name: "filing", describes: "Filing title, e.g. GSTR-3B" },
  { name: "period", describes: "Period being filed, e.g. Aug 2026" },
  { name: "dueDate", describes: "Due date, e.g. 20 Sep 2026" },
  { name: "documents", describes: "Bulleted list of what is still outstanding" },
  { name: "documentCount", describes: "How many documents are outstanding" },
  { name: "penalty", describes: "Statutory penalty if the date is missed" },
  { name: "firm", describes: "Your firm's name" },
  { name: "replyAddress", describes: "Reply address that files attachments automatically (email only)" },
];

// ------------------------------------------------------------------ defaults

const WHATSAPP_DEFAULTS: Record<Stage, string> = {
  T10: `Hello {{contact}},

We are preparing your {{filing}} for {{period}}, due on {{dueDate}}.

Please share the following when convenient:
{{documents}}

You can reply to this message with the files.

- {{firm}} (via Vahi)`,

  T5: `Hello {{contact}},

A reminder that {{filing}} for {{period}} is due on {{dueDate}} and we are still waiting on:
{{documents}}

Sharing these in the next day or two gives us time to review before filing.

- {{firm}} (via Vahi)`,

  T2: `Hello {{contact}},

{{filing}} for {{period}} is due in 2 days ({{dueDate}}). The following are still pending:
{{documents}}

Without these we will not be able to file on time.

- {{firm}} (via Vahi)`,

  T1: `Hello {{contact}},

Final reminder. {{filing}} for {{period}} is due tomorrow ({{dueDate}}).

Still pending:
{{documents}}

If we miss the date: {{penalty}}

Please send these today.

- {{firm}} (via Vahi)`,

  OVERDUE: `Hello {{contact}},

{{filing}} for {{period}} was due on {{dueDate}} and remains unfiled because we have not received:
{{documents}}

{{penalty}}

Please treat this as urgent.

- {{firm}} (via Vahi)`,
};

const EMAIL_SUBJECTS: Record<Stage, string> = {
  T10: "{{filing}} — {{period}} — {{documentCount}} pending",
  T5: "Reminder: {{filing}} — {{period}} due {{dueDate}}",
  T2: "Due in 2 days: {{filing}} — {{period}}",
  T1: "Due tomorrow: {{filing}} — {{period}}",
  OVERDUE: "Overdue: {{filing}} — {{period}}",
};

/** Email bodies reuse the WhatsApp wording plus the self-filing reply line. */
const EMAIL_TAIL = `

--
Reply to this email with the documents attached and they will be filed
against {{filing}} automatically.`;

export function defaultTemplate(
  channel: TemplateChannel,
  stage: Stage,
): { subject: string | null; body: string } {
  if (channel === "EMAIL") {
    return { subject: EMAIL_SUBJECTS[stage], body: WHATSAPP_DEFAULTS[stage] + EMAIL_TAIL };
  }
  return { subject: null, body: WHATSAPP_DEFAULTS[stage] };
}

// ----------------------------------------------------------------- rendering

/**
 * Substitute {{name}} placeholders.
 *
 * An unknown placeholder is left visible rather than silently blanked — a firm
 * who typos {{clientname}} should see it in the preview, not send a message
 * with a hole in it.
 */
export function render(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => {
    const value = (vars as unknown as Record<string, string>)[name];
    return value === undefined ? whole : value;
  });
}

/** Placeholders used by a template that Vahi cannot fill. */
export function unknownVariables(template: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.map((v) => v.name as string));
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!known.has(m[1])) found.add(m[1]);
  }
  return [...found];
}
