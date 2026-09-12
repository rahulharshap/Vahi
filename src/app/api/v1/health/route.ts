import { withApi, apiOk } from "@/lib/api";
import { getFirm, getSettings } from "@/lib/tenant";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Confirms a key works and says which firm it acts for. */
export const GET = withApi("read", async (_req, ctx) => {
  const firm = await getFirm(ctx.firmId);
  const settings = await getSettings(ctx.firmId);
  const counts = await one<{ clients: string; filings: string; documents: string }>(
    `SELECT
       (SELECT COUNT(*) FROM clients WHERE firm_id = ?) AS clients,
       (SELECT COUNT(*) FROM filings f JOIN clients c ON c.id = f.client_id WHERE c.firm_id = ?) AS filings,
       (SELECT COUNT(*) FROM documents WHERE firm_id = ?) AS documents`,
    [ctx.firmId, ctx.firmId, ctx.firmId],
  );
  return apiOk({
    firm: { id: firm?.id, name: firm?.name, city: firm?.city, timezone: firm?.timezone },
    key: { id: ctx.keyId, scopes: ctx.scopes },
    counts: {
      clients: Number(counts?.clients ?? 0),
      filings: Number(counts?.filings ?? 0),
      documents: Number(counts?.documents ?? 0),
    },
    chase: { enabled: settings.chase_enabled, sendHour: settings.chase_send_hour },
  });
});
