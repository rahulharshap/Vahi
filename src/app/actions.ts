"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addDays,
  createClient,
  deleteClient,
  dueStage,
  getFiling,
  listFilings,
  pendingChases,
  recordMessage,
  setAssignee,
  setExtendedDue,
  setNotes,
  setFilingStatus,
  syncAllFilings,
  syncClientFilings,
  toggleDocReceived,
  todayISO,
  updateClient,
  firm,
  type ClientInput,
  type FilingStatus,
} from "@/lib/store";
import { composeChase, dispatch, type Stage } from "@/lib/whatsapp";
import { reseed } from "@/lib/seed";
import type { EntityType, GstScheme } from "@/lib/compliance";

function refresh() {
  revalidatePath("/", "layout");
}

function parseClient(fd: FormData): ClientInput {
  return {
    name: String(fd.get("name") ?? "").trim(),
    entityType: String(fd.get("entityType") ?? "PROPRIETOR") as EntityType,
    pan: (String(fd.get("pan") ?? "").trim() || null) as string | null,
    gstin: (String(fd.get("gstin") ?? "").trim() || null) as string | null,
    gstScheme: String(fd.get("gstScheme") ?? "NONE") as GstScheme,
    tdsDeductor: fd.get("tdsDeductor") === "on",
    hasEmployees: fd.get("hasEmployees") === "on",
    taxAudit: fd.get("taxAudit") === "on",
    directorCount: Number(fd.get("directorCount") ?? 0) || 0,
    state: String(fd.get("state") ?? "Telangana"),
    contactName: (String(fd.get("contactName") ?? "").trim() || null) as string | null,
    contactPhone: (String(fd.get("contactPhone") ?? "").trim() || null) as string | null,
  };
}

const WINDOW_BACK = -220;
const WINDOW_FWD = 200;

export async function createClientAction(fd: FormData) {
  const input = parseClient(fd);
  if (!input.name) throw new Error("Client name is required");
  const id = await createClient(input);
  const today = todayISO();
  await syncClientFilings(id, addDays(today, WINDOW_BACK), addDays(today, WINDOW_FWD));
  refresh();
  redirect("/clients/" + id);
}

export async function updateClientAction(id: string, fd: FormData) {
  await updateClient(id, parseClient(fd));
  const today = todayISO();
  await syncClientFilings(id, addDays(today, WINDOW_BACK), addDays(today, WINDOW_FWD));
  refresh();
  redirect("/clients/" + id);
}

export async function deleteClientAction(id: string) {
  await deleteClient(id);
  refresh();
  redirect("/clients");
}

export async function setStatusAction(filingId: string, status: FilingStatus) {
  await setFilingStatus(filingId, status);
  refresh();
}

export async function toggleDocAction(filingId: string, doc: string) {
  await toggleDocReceived(filingId, doc);
  refresh();
}

export async function setExtendedDueAction(filingId: string, fd: FormData) {
  const raw = String(fd.get("extendedDue") ?? "").trim();
  await setExtendedDue(filingId, raw || null);
  refresh();
}

export async function resyncAction() {
  const today = todayISO();
  await syncAllFilings(addDays(today, WINDOW_BACK), addDays(today, WINDOW_FWD));
  refresh();
  redirect("/board");
}

export async function reseedAction() {
  await reseed();
  refresh();
  redirect("/board");
}

/** Send one chase. Returns nothing; the row disappears from the queue. */
export async function sendChaseAction(filingId: string, stage: Stage) {
  const f = await getFiling(filingId);
  if (!f) return;
  const body = composeChase(stage, {
    clientName: f.clientName,
    contactName: f.contactName,
    filingTitle: f.title,
    periodLabel: f.period_label,
    dueDate: f.effectiveDue,
    docsOutstanding: f.docsOutstanding,
    firmName: (await firm()).name,
    penaltyNote: f.penalty_note,
  });
  let status = "SENT";
  try {
    const res = await dispatch(f.contactPhone ?? "", body);
    status = res.note ? "RECORDED" : "SENT";
  } catch {
    status = "FAILED";
  }
  await recordMessage(f.id, f.client_id, stage, body, status);
  refresh();
}

/** Send every chase currently due. This is the button that replaces a morning. */
export async function sendAllChasesAction() {
  for (const { filing, stage } of await pendingChases()) {
    await sendChaseAction(filing.id, stage);
  }
  refresh();
}

export async function previewChase(filingId: string): Promise<string | null> {
  const f = await getFiling(filingId);
  if (!f) return null;
  const stage = dueStage(f) ?? "T10";
  return composeChase(stage, {
    clientName: f.clientName,
    contactName: f.contactName,
    filingTitle: f.title,
    periodLabel: f.period_label,
    dueDate: f.effectiveDue,
    docsOutstanding: f.docsOutstanding,
    firmName: (await firm()).name,
    penaltyNote: f.penalty_note,
  });
}

export async function markAllFiledForClient(clientId: string) {
  for (const f of await listFilings({ clientId })) {
    if (f.daysLeft < 0 && f.status !== "FILED") await setFilingStatus(f.id, "FILED");
  }
  refresh();
}

export async function setAssigneeAction(filingId: string, fd: FormData) {
  await setAssignee(filingId, String(fd.get("assignee") ?? ""));
  refresh();
}

export async function setNotesAction(filingId: string, fd: FormData) {
  await setNotes(filingId, String(fd.get("notes") ?? ""));
  refresh();
}
