import { withApi, apiOk, limitFrom } from "@/lib/api";
import { addDays, listFilings, todayISO, type FilingStatus } from "@/lib/store";
import type { Category } from "@/lib/compliance";

export const dynamic = "force-dynamic";

/**
 * Filings, filtered the same way the UI filters them. A filing is one
 * (client, obligation, period) — GSTR-3B for Aug 2026 — which is the unit
 * documents attach to and chases are sent about.
 */
export const GET = withApi("read", async (_req, ctx) => {
  const p = ctx.params;
  const today = todayISO();
  const rows = await listFilings({
    clientId: p.get("clientId") ?? undefined,
    from: p.get("from") ?? addDays(today, -90),
    to: p.get("to") ?? addDays(today, 90),
    status: (p.get("status") as FilingStatus) ?? undefined,
    category: (p.get("category") as Category) ?? undefined,
    openOnly: p.get("openOnly") === "true",
    search: p.get("q") ?? undefined,
    assignee: p.has("assignee") ? (p.get("assignee") as string) : undefined,
  });
  const limit = limitFrom(ctx.params);
  return apiOk(
    rows.slice(0, limit).map((f) => ({
      id: f.id,
      clientId: f.client_id,
      client: f.clientName,
      obligation: f.obligation_code,
      title: f.title,
      category: f.category,
      authority: f.authority,
      period: f.period_label,
      periodKey: f.period_key,
      dueDate: f.due_date,
      extendedDue: f.extended_due,
      effectiveDue: f.effectiveDue,
      daysLeft: f.daysLeft,
      status: f.status,
      risk: f.risk,
      assignee: f.assignee,
      documentsRequired: f.docsRequiredList,
      documentsReceived: f.docsReceivedList,
      documentsOutstanding: f.docsOutstanding,
      exposure: f.exposure,
    })),
    { total: rows.length, returned: Math.min(rows.length, limit) },
  );
});
