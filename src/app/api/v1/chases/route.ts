import { withApi, apiOk, apiError, jsonBody, limitFrom } from "@/lib/api";
import { audit, logger } from "@/lib/log";
import { currentFirmId, getSettings } from "@/lib/tenant";
import { composeFromTemplate } from "@/lib/messages";
import { getClient, getFiling, pendingChases, recordMessage } from "@/lib/store";
import { channelsFor, deliver } from "@/lib/notify";
import { replyAddress } from "@/lib/intake";
import { firm } from "@/lib/store";
import type { Stage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** What is due to be chased right now, with the message already composed. */
export const GET = withApi("read", async (_req, ctx) => {
  const queue = await pendingChases();
  const limit = limitFrom(ctx.params, 50);
  const firmId = ctx.firmId;
  const firmName = (await firm()).name;

  const items = await Promise.all(
    queue.slice(0, limit).map(async ({ filing, stage }) => {
      const channel = filing.contactPhone ? "WHATSAPP" : "EMAIL";
      const composed = await composeFromTemplate(firmId, channel, stage, {
        clientName: filing.clientName,
        contactName: filing.contactName,
        filingTitle: filing.title,
        periodLabel: filing.period_label,
        dueDate: filing.effectiveDue,
        docsOutstanding: filing.docsOutstanding,
        penaltyNote: filing.penalty_note,
        firmName,
        filingId: filing.id,
      });
      return {
        filingId: filing.id,
        client: filing.clientName,
        title: filing.title,
        period: filing.period_label,
        dueDate: filing.effectiveDue,
        daysLeft: filing.daysLeft,
        stage,
        channel,
        to: filing.contactPhone ?? filing.contactPhone,
        documentsOutstanding: filing.docsOutstanding,
        subject: composed.subject,
        body: composed.body,
      };
    }),
  );

  return apiOk(items, { total: queue.length, returned: items.length });
});

/**
 * Send chases. Either a specific filing, or every chase currently due.
 *
 * Honours the firm's chase_enabled setting: a firm that has switched
 * automatic chasing off gets a 409 rather than a surprise send.
 */
export const POST = withApi("write", async (req) => {
  const parsed = await jsonBody<{ filingId?: string; all?: boolean; dryRun?: boolean }>(req);
  if (!parsed.ok) return parsed.res;
  const { filingId, all, dryRun } = parsed.body;

  const firmId = await currentFirmId();
  const settings = await getSettings(firmId);
  if (!settings.chase_enabled && !dryRun) {
    return apiError(409, "chasing_disabled", "Automatic chasing is switched off for this firm in settings.");
  }

  let targets: Array<{ filingId: string; stage: Stage }>;
  if (filingId) {
    const f = await getFiling(filingId);
    if (!f) return apiError(404, "not_found", "No filing with that id in this firm.");
    const { dueStage } = await import("@/lib/store");
    const stage = dueStage(f);
    if (!stage) return apiError(409, "nothing_due", "No chase is due for that filing right now.");
    targets = [{ filingId, stage }];
  } else if (all) {
    targets = (await pendingChases()).map((p) => ({ filingId: p.filing.id, stage: p.stage }));
  } else {
    return apiError(400, "missing_target", "Provide `filingId`, or `all: true`.");
  }

  const firmName = (await firm()).name;
  const results = [];

  for (const t of targets) {
    const f = await getFiling(t.filingId);
    const client = f ? await getClient(f.client_id) : undefined;
    if (!f || !client) continue;

    const facts = {
      clientName: f.clientName,
      contactName: f.contactName,
      filingTitle: f.title,
      periodLabel: f.period_label,
      dueDate: f.effectiveDue,
      docsOutstanding: f.docsOutstanding,
      penaltyNote: f.penalty_note,
      firmName,
      filingId: f.id,
    };

    for (const channel of channelsFor(client)) {
      const composed = await composeFromTemplate(firmId, channel, t.stage, facts);
      const to = channel === "EMAIL" ? client.email : client.contact_phone;
      if (!to) continue;

      if (dryRun) {
        results.push({ filingId: f.id, stage: t.stage, channel, to, status: "DRY_RUN" });
        continue;
      }

      let status: string;
      try {
        status = (
          await deliver({
            channel,
            to,
            body: composed.body,
            subject: composed.subject ?? undefined,
            replyTo: channel === "EMAIL" ? replyAddress(f.id) : undefined,
          })
        ).status;
      } catch (e) {
        status = "FAILED";
        logger.error("chase.delivery_failed", {
          filingId: f.id,
          channel,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      await recordMessage(f.id, f.client_id, t.stage, composed.body, status, channel);
      results.push({ filingId: f.id, stage: t.stage, channel, to, status });
    }
  }

  if (!dryRun) {
    await audit({ action: "chase.sent", entity: "chase", detail: { count: results.length } });
  }
  return apiOk(results, { sent: results.length, dryRun: Boolean(dryRun) });
});
