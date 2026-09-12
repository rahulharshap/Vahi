"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addDays,
  assignDocument,
  createClient,
  deleteClient,
  dueStage,
  getClient,
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
import { type Stage } from "@/lib/whatsapp";
import { channelsFor, deliver } from "@/lib/notify";
import { composeFromTemplate } from "@/lib/messages";
import { audit } from "@/lib/log";
import { replyAddress } from "@/lib/intake";
import { reseed } from "@/lib/seed";
import type { EntityType, GstScheme } from "@/lib/compliance";
import type { Channel } from "@/lib/store";

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
    email: (String(fd.get("email") ?? "").trim().toLowerCase() || null) as string | null,
    channel: String(fd.get("channel") ?? "WHATSAPP") as Channel,
  };
}

const WINDOW_BACK = -220;
const WINDOW_FWD = 200;

export async function createClientAction(fd: FormData) {
  const input = parseClient(fd);
  if (!input.name) throw new Error("Client name is required");
  const id = await createClient(input);
  const today = todayISO();
  const generated = await syncClientFilings(id, addDays(today, WINDOW_BACK), addDays(today, WINDOW_FWD));
  await audit({ action: "client.created", entity: "client", entityId: id, detail: { name: input.name, filings: generated } });
  refresh();
  redirect("/clients/" + id);
}

export async function updateClientAction(id: string, fd: FormData) {
  const input = parseClient(fd);
  await updateClient(id, input);
  await audit({ action: "client.updated", entity: "client", entityId: id, detail: { name: input.name } });
  const today = todayISO();
  await syncClientFilings(id, addDays(today, WINDOW_BACK), addDays(today, WINDOW_FWD));
  refresh();
  redirect("/clients/" + id);
}

export async function deleteClientAction(id: string) {
  await deleteClient(id);
  await audit({ action: "client.deleted", entity: "client", entityId: id });
  refresh();
  redirect("/clients");
}

export async function setStatusAction(filingId: string, status: FilingStatus) {
  await setFilingStatus(filingId, status);
  await audit({ action: "filing.status", entity: "filing", entityId: filingId, detail: { status } });
  refresh();
}

export async function toggleDocAction(filingId: string, doc: string) {
  await toggleDocReceived(filingId, doc);
  refresh();
}

export async function setExtendedDueAction(filingId: string, fd: FormData) {
  const raw = String(fd.get("extendedDue") ?? "").trim();
  await setExtendedDue(filingId, raw || null);
  await audit({ action: "filing.extended", entity: "filing", entityId: filingId, detail: { extendedDue: raw || null } });
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
  const client = await getClient(f.client_id);
  if (!client) return;

  const firmId = await currentFirmId();
  const facts = {
    clientName: f.clientName,
    contactName: f.contactName,
    filingTitle: f.title,
    periodLabel: f.period_label,
    dueDate: f.effectiveDue,
    docsOutstanding: f.docsOutstanding,
    penaltyNote: f.penalty_note,
    firmName: (await firm()).name,
    filingId: f.id,
  };

  const channels = channelsFor(client);

  // a client with no usable address still records an attempt, so the gap shows
  // up in the history rather than disappearing
  if (channels.length === 0) {
    const fallback = await composeFromTemplate(firmId, "WHATSAPP", stage, facts);
    await recordMessage(f.id, f.client_id, stage, fallback.body, "NO_ADDRESS", "WHATSAPP");
    refresh();
    return;
  }

  for (const channel of channels) {
    const composed = await composeFromTemplate(firmId, channel, stage, facts);
    const to = channel === "EMAIL" ? client.email : client.contact_phone;
    if (!to) continue;
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
    } catch {
      status = "FAILED";
    }
    await recordMessage(f.id, f.client_id, stage, composed.body, status, channel);
  }
  await audit({ action: "chase.sent", entity: "filing", entityId: f.id, detail: { stage, channels } });
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
  const composed = await composeFromTemplate(await currentFirmId(), "WHATSAPP", stage, {
    clientName: f.clientName,
    contactName: f.contactName,
    filingTitle: f.title,
    periodLabel: f.period_label,
    dueDate: f.effectiveDue,
    docsOutstanding: f.docsOutstanding,
    penaltyNote: f.penalty_note,
    firmName: (await firm()).name,
    filingId: f.id,
  });
  return composed.body;
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

export async function assignDocumentAction(documentId: string, fd: FormData) {
  const target = String(fd.get("target") ?? "");
  const [filingId, docLabel] = target.split("::");
  if (!filingId) return;
  await assignDocument(documentId, filingId, docLabel || null);
  await audit({ action: "document.assigned", entity: "document", entityId: documentId, detail: { filingId, docLabel } });
  refresh();
}

// ------------------------------------------------------------- settings

import {
  createApiKey,
  currentFirmId,
  revokeApiKey,
  updateFirm,
  updateSettings,
  type SettingsInput,
} from "@/lib/tenant";
import { saveTemplate, resetTemplate } from "@/lib/messages";

const str = (fd: FormData, k: string) => (String(fd.get(k) ?? "").trim() || null) as string | null;

export async function saveFirmAction(fd: FormData) {
  const firmId = await currentFirmId();
  await updateFirm(firmId, {
    name: String(fd.get("name") ?? "").trim() || undefined,
    city: String(fd.get("city") ?? "").trim() || undefined,
    timezone: String(fd.get("timezone") ?? "").trim() || undefined,
  });
  const settings: SettingsInput = {
    sender_name: str(fd, "sender_name"),
    wa_business_number: str(fd, "wa_business_number"),
    reply_to_email: str(fd, "reply_to_email"),
    intake_domain: str(fd, "intake_domain"),
    wa_provider: str(fd, "wa_provider"),
    email_provider: str(fd, "email_provider"),
    wa_credential_ref: str(fd, "wa_credential_ref"),
    email_credential_ref: str(fd, "email_credential_ref"),
    default_channel: String(fd.get("default_channel") ?? "WHATSAPP") as "WHATSAPP" | "EMAIL" | "BOTH",
    chase_enabled: fd.get("chase_enabled") === "on",
    chase_send_hour: Number(fd.get("chase_send_hour") ?? 9) || 9,
    chase_lookback_days: Number(fd.get("chase_lookback_days") ?? 45) || 45,
  };
  await updateSettings(firmId, settings);
  await audit({ action: "settings.updated", entity: "firm", entityId: firmId, detail: { fields: Object.keys(settings) } });
  refresh();
}

export async function createApiKeyAction(fd: FormData) {
  const firmId = await currentFirmId();
  const name = String(fd.get("keyName") ?? "").trim() || "Untitled key";
  const scopes = String(fd.get("scopes") ?? "read") as "read" | "write" | "admin";
  const created = await createApiKey(firmId, name, scopes);
  await audit({ action: "apikey.created", entity: "api_key", entityId: created.id, detail: { name, scopes } });
  refresh();
  // the plaintext is shown once, via the URL, and never stored
  redirect("/settings?created=" + encodeURIComponent(created.plaintext));
}

export async function revokeApiKeyAction(id: string) {
  await revokeApiKey(await currentFirmId(), id);
  await audit({ action: "apikey.revoked", entity: "api_key", entityId: id });
  refresh();
}

export async function saveTemplateAction(channel: "WHATSAPP" | "EMAIL", stage: string, fd: FormData) {
  await saveTemplate(await currentFirmId(), channel, stage as never, {
    subject: str(fd, "subject"),
    body: String(fd.get("body") ?? ""),
  });
  refresh();
}

export async function resetTemplateAction(channel: "WHATSAPP" | "EMAIL", stage: string) {
  await resetTemplate(await currentFirmId(), channel, stage as never);
  refresh();
}

// ---------------------------------------------------------------- members

import { inviteToFirm, revokeInvitation, SeatLimitReached, type Role } from "@/lib/auth";

export async function inviteMemberAction(fd: FormData) {
  const email = String(fd.get("inviteEmail") ?? "").trim().toLowerCase();
  const role = String(fd.get("inviteRole") ?? "staff") as Role;
  if (!email) return;
  const firmId = await currentFirmId();
  try {
    await inviteToFirm(firmId, email, role, "ui");
  } catch (e) {
    if (e instanceof SeatLimitReached) {
      // surfaced on the settings page rather than thrown at the user as a
      // stack trace: running out of seats is a normal state, not a fault
      redirect("/settings?seats=" + encodeURIComponent(e.message));
    }
    throw e;
  }
  await audit({ action: "member.invited", entity: "invitation", detail: { email, role } });
  refresh();
}

export async function revokeInviteAction(id: string) {
  await revokeInvitation(await currentFirmId(), id);
  await audit({ action: "invitation.revoked", entity: "invitation", entityId: id });
  refresh();
}
