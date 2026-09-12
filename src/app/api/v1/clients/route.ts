import { withApi, apiOk, apiError, jsonBody, limitFrom } from "@/lib/api";
import { audit } from "@/lib/log";
import { addDays, createClient, listClients, syncClientFilings, todayISO, type ClientInput } from "@/lib/store";
import { ENTITY_LABEL } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export const GET = withApi("read", async (_req, ctx) => {
  const rows = await listClients(ctx.params.get("q") ?? undefined);
  const limit = limitFrom(ctx.params);
  return apiOk(
    rows.slice(0, limit).map((c) => ({
      id: c.id,
      name: c.name,
      entityType: c.entity_type,
      entityLabel: ENTITY_LABEL[c.entity_type],
      pan: c.pan,
      gstin: c.gstin,
      gstScheme: c.gst_scheme,
      tdsDeductor: !!c.tds_deductor,
      hasEmployees: !!c.has_employees,
      taxAudit: !!c.tax_audit,
      state: c.state,
      contactName: c.contact_name,
      contactPhone: c.contact_phone,
      email: c.email,
      channel: c.channel,
    })),
    { total: rows.length, returned: Math.min(rows.length, limit) },
  );
});

export const POST = withApi("write", async (req) => {
  const parsed = await jsonBody<Partial<ClientInput>>(req);
  if (!parsed.ok) return parsed.res;
  const b = parsed.body;
  if (!b.name || !b.entityType) {
    return apiError(400, "missing_field", "`name` and `entityType` are required.");
  }
  const id = await createClient({
    name: b.name,
    entityType: b.entityType,
    pan: b.pan ?? null,
    gstin: b.gstin ?? null,
    gstScheme: b.gstScheme ?? "NONE",
    tdsDeductor: !!b.tdsDeductor,
    hasEmployees: !!b.hasEmployees,
    taxAudit: !!b.taxAudit,
    directorCount: b.directorCount ?? 0,
    state: b.state ?? "Telangana",
    contactName: b.contactName ?? null,
    contactPhone: b.contactPhone ?? null,
    email: b.email ?? null,
    channel: b.channel ?? "WHATSAPP",
  });
  const today = todayISO();
  const created = await syncClientFilings(id, addDays(today, -220), addDays(today, 200));
  await audit({ action: "client.created", entity: "client", entityId: id, detail: { name: b.name, filings: created } });
  return apiOk({ id, filingsGenerated: created });
});
