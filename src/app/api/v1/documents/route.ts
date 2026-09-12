import { withApi, apiOk, apiError, jsonBody, limitFrom } from "@/lib/api";
import { audit } from "@/lib/log";
import { assignDocument, unmatchedDocuments } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Documents that arrived but could not be placed. The triage queue. */
export const GET = withApi("read", async (_req, ctx) => {
  const rows = await unmatchedDocuments();
  const limit = limitFrom(ctx.params);
  return apiOk(
    rows.slice(0, limit).map((d) => ({
      id: d.id,
      fileName: d.file_name,
      contentType: d.content_type,
      sizeBytes: d.size_bytes,
      source: d.source,
      from: d.from_address,
      subject: d.subject,
      receivedAt: d.received_at,
    })),
    { total: rows.length, returned: Math.min(rows.length, limit) },
  );
});

/** Place a document against a filing, ticking its checklist entry. */
export const POST = withApi("write", async (req) => {
  const parsed = await jsonBody<{ documentId?: string; filingId?: string; documentLabel?: string | null }>(req);
  if (!parsed.ok) return parsed.res;
  const { documentId, filingId, documentLabel } = parsed.body;
  if (!documentId || !filingId) {
    return apiError(400, "missing_field", "`documentId` and `filingId` are required.");
  }
  await assignDocument(documentId, filingId, documentLabel ?? null);
  await audit({
    action: "document.assigned",
    entity: "document",
    entityId: documentId,
    detail: { filingId, documentLabel },
  });
  return apiOk({ documentId, filingId, documentLabel: documentLabel ?? null });
});
