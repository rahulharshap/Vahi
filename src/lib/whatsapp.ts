/**
 * Chase message composition.
 *
 * The product insight: CAs already know the deadlines. What they cannot do is
 * nag 400 clients for documents without it costing them the relationship. A
 * system sending it removes the awkwardness, so these read as neutral and
 * procedural, never accusatory.
 *
 * Bodies here map to approved WhatsApp Business template variables. Provider
 * (AiSensy / Interakt / Gupshup) is swapped in `dispatch` only.
 */

export type Stage = "T10" | "T5" | "T2" | "T1" | "OVERDUE";

export const STAGE_OFFSET: Record<Stage, number> = {
  T10: 10,
  T5: 5,
  T2: 2,
  T1: 1,
  OVERDUE: -1,
};

export const STAGE_LABEL: Record<Stage, string> = {
  T10: "10 days before",
  T5: "5 days before",
  T2: "2 days before",
  T1: "1 day before",
  OVERDUE: "Past due",
};

export interface ChaseContext {
  clientName: string;
  contactName: string | null;
  filingTitle: string;
  periodLabel: string;
  dueDate: string;
  docsOutstanding: string[];
  firmName: string;
  penaltyNote: string | null;
}

function pretty(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d + " " + months[m - 1] + " " + y;
}

function bulletList(items: string[]): string {
  return items.map((i) => "  - " + i).join("\n");
}

export function composeChase(stage: Stage, ctx: ChaseContext): string {
  const who = ctx.contactName ? ctx.contactName : ctx.clientName;
  const head = "Hello " + who + ",";
  const what = ctx.filingTitle + " for " + ctx.periodLabel;
  const due = pretty(ctx.dueDate);
  const docs = bulletList(ctx.docsOutstanding);
  const sign = "\n\n- " + ctx.firmName + " (via Vahi)";

  switch (stage) {
    case "T10":
      return (
        head +
        "\n\nWe are preparing your " +
        what +
        ", due on " +
        due +
        ".\n\nPlease share the following when convenient:\n" +
        docs +
        "\n\nYou can reply to this message with the files." +
        sign
      );
    case "T5":
      return (
        head +
        "\n\nA reminder that " +
        what +
        " is due on " +
        due +
        " and we are still waiting on:\n" +
        docs +
        "\n\nSharing these in the next day or two gives us time to review before filing." +
        sign
      );
    case "T2":
      return (
        head +
        "\n\n" +
        what +
        " is due in 2 days (" +
        due +
        "). The following are still pending:\n" +
        docs +
        "\n\nWithout these we will not be able to file on time." +
        sign
      );
    case "T1":
      return (
        head +
        "\n\nFinal reminder. " +
        what +
        " is due tomorrow (" +
        due +
        ").\n\nStill pending:\n" +
        docs +
        (ctx.penaltyNote ? "\n\nIf we miss the date: " + ctx.penaltyNote : "") +
        "\n\nPlease send these today." +
        sign
      );
    case "OVERDUE":
      return (
        head +
        "\n\n" +
        what +
        " was due on " +
        due +
        " and remains unfiled because we have not received:\n" +
        docs +
        (ctx.penaltyNote ? "\n\n" + ctx.penaltyNote : "") +
        "\n\nPlease treat this as urgent." +
        sign
      );
  }
}

/**
 * Provider dispatch. In dev this records the message and returns a fake id, so
 * the whole chase pipeline is exercisable without a BSP account or template
 * approval. Swap the body of this function for the provider call in prod.
 */
export async function dispatch(
  phone: string,
  body: string,
): Promise<{ ok: boolean; providerId: string; note?: string }> {
  const provider = process.env.WA_PROVIDER;
  if (!provider) {
    return {
      ok: true,
      providerId: "dev_" + Math.random().toString(36).slice(2, 10),
      note: "WA_PROVIDER unset - message recorded locally, not sent",
    };
  }
  // Real provider integration goes here once a BSP account and approved
  // templates exist. Intentionally not stubbed with a fake HTTP call.
  throw new Error("WA_PROVIDER=" + provider + " is configured but no adapter is implemented yet");
}
