import { composeChase, type ChaseContext, type Stage, STAGE_LABEL } from "./whatsapp";
import { replyAddress, INTAKE_DOMAIN } from "./intake";
import type { Channel } from "./store";

/**
 * Channel-agnostic delivery.
 *
 * Clients send and receive by email, by WhatsApp, or both, and which one is a
 * property of the client rather than a choice the firm gets to make. The
 * message itself is composed once; only the envelope differs.
 *
 * Neither provider is wired yet. Both throw rather than pretending to send,
 * because a chase that silently goes nowhere is worse than one that visibly
 * fails — the firm would believe the client had been asked.
 */

export type DeliveryChannel = "WHATSAPP" | "EMAIL";

export interface Delivery {
  channel: DeliveryChannel;
  to: string;
  body: string;
  subject?: string;
  replyTo?: string;
}

/** Which channels to use for a client, in the order they should be tried. */
export function channelsFor(client: {
  channel: Channel;
  contact_phone: string | null;
  email: string | null;
}): DeliveryChannel[] {
  const out: DeliveryChannel[] = [];
  if (client.channel !== "EMAIL" && client.contact_phone) out.push("WHATSAPP");
  if (client.channel !== "WHATSAPP" && client.email) out.push("EMAIL");
  return out;
}

/** Subject lines say what is wanted and by when — inbox-scannable. */
export function chaseSubject(ctx: ChaseContext, stage: Stage): string {
  const n = ctx.docsOutstanding.length;
  const what = ctx.filingTitle + " — " + ctx.periodLabel;
  if (stage === "OVERDUE") return "Overdue: " + what;
  if (stage === "T1") return "Due tomorrow: " + what;
  return what + " — " + n + (n === 1 ? " document" : " documents") + " pending";
}

export function buildDeliveries(
  channels: DeliveryChannel[],
  stage: Stage,
  ctx: ChaseContext,
  to: { phone: string | null; email: string | null },
  filingId: string,
): Delivery[] {
  const body = composeChase(stage, ctx);
  const out: Delivery[] = [];
  for (const channel of channels) {
    if (channel === "WHATSAPP" && to.phone) {
      out.push({ channel, to: to.phone, body });
    }
    if (channel === "EMAIL" && to.email) {
      out.push({
        channel,
        to: to.email,
        subject: chaseSubject(ctx, stage),
        // the address carries the filing, so a reply routes itself
        replyTo: replyAddress(filingId),
        body:
          body +
          "\n\n--\nReply to this email with the documents attached and they will be " +
          "filed against " +
          ctx.filingTitle +
          " automatically.",
      });
    }
  }
  return out;
}

/**
 * Hand a message to its provider.
 *
 * Set WA_PROVIDER / EMAIL_PROVIDER once an account exists and write the
 * adapter here. Until then this records locally so the whole pipeline —
 * composition, routing, history, and the reply address — is exercisable
 * without waiting on template approval or DNS.
 */
export async function deliver(d: Delivery): Promise<{ status: string; note?: string }> {
  const provider = d.channel === "EMAIL" ? process.env.EMAIL_PROVIDER : process.env.WA_PROVIDER;
  if (!provider) {
    return {
      status: "RECORDED",
      note:
        (d.channel === "EMAIL" ? "EMAIL_PROVIDER" : "WA_PROVIDER") +
        " unset — composed and recorded, not delivered",
    };
  }
  throw new Error(
    provider + " is configured for " + d.channel + " but no adapter is implemented in src/lib/notify.ts",
  );
}

export { STAGE_LABEL, INTAKE_DOMAIN };
