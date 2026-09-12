import { withApi, apiOk, apiError, jsonBody } from "@/lib/api";
import { audit } from "@/lib/log";
import {
  documentsForFiling,
  getFiling,
  listMessages,
  setAssignee,
  setExtendedDue,
  setFilingStatus,
  setNotes,
  type FilingStatus,
} from "@/lib/store";

export const dynamic = "force-dynamic";

const STATUSES: FilingStatus[] = ["AWAITING_DOCS", "DOCS_RECEIVED", "IN_PROGRESS", "FILED", "NOT_APPLICABLE"];

export const GET = withApi("read", async (req) => {
  const id = new URL(req.url).pathname.split("/").pop()!;
  const f = await getFiling(id);
  if (!f) return apiError(404, "not_found", "No filing with that id in this firm.");
  return apiOk({
    id: f.id,
    client: { id: f.client_id, name: f.clientName, phone: f.contactPhone, email: f.contactName },
    title: f.title,
    obligation: f.obligation_code,
    period: f.period_label,
    dueDate: f.due_date,
    effectiveDue: f.effectiveDue,
    status: f.status,
    risk: f.risk,
    assignee: f.assignee,
    notes: f.notes,
    penaltyNote: f.penalty_note,
    documentsRequired: f.docsRequiredList,
    documentsOutstanding: f.docsOutstanding,
    chasesSent: f.stagesSent,
    messages: await listMessages(id),
    documents: await documentsForFiling(id),
  });
});

export const PATCH = withApi("write", async (req) => {
  const id = new URL(req.url).pathname.split("/").pop()!;
  const existing = await getFiling(id);
  if (!existing) return apiError(404, "not_found", "No filing with that id in this firm.");

  const parsed = await jsonBody<{
    status?: FilingStatus;
    assignee?: string | null;
    notes?: string | null;
    extendedDue?: string | null;
  }>(req);
  if (!parsed.ok) return parsed.res;
  const b = parsed.body;
  const changed: string[] = [];

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) {
      return apiError(400, "invalid_status", "status must be one of " + STATUSES.join(", "));
    }
    await setFilingStatus(id, b.status);
    changed.push("status");
  }
  if (b.assignee !== undefined) {
    await setAssignee(id, b.assignee);
    changed.push("assignee");
  }
  if (b.notes !== undefined) {
    await setNotes(id, b.notes);
    changed.push("notes");
  }
  if (b.extendedDue !== undefined) {
    if (b.extendedDue && !/^\d{4}-\d{2}-\d{2}$/.test(b.extendedDue)) {
      return apiError(400, "invalid_date", "extendedDue must be YYYY-MM-DD or null.");
    }
    await setExtendedDue(id, b.extendedDue);
    changed.push("extendedDue");
  }

  if (changed.length === 0) {
    return apiError(400, "nothing_to_do", "Provide at least one of status, assignee, notes, extendedDue.");
  }

  await audit({
    action: "filing.updated",
    entity: "filing",
    entityId: id,
    detail: { changed, from: { status: existing.status, assignee: existing.assignee }, to: b },
  });
  return apiOk({ id, changed });
});
