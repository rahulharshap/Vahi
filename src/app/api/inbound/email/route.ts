import { NextResponse } from "next/server";
import { filingFromRecipients, matchDocument } from "@/lib/intake";
import {
  clientByEmail,
  getFiling,
  markDocReceived,
  matchCandidates,
  recordDocument,
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Inbound email: documents arriving as replies to a chase.
 *
 * Providers differ in payload shape (SendGrid Inbound Parse posts multipart,
 * Postmark and Cloudflare post JSON), so this accepts a normalised body and
 * the provider-specific translation belongs in a thin adapter in front of it.
 * That keeps the matching logic — the part worth testing — free of any one
 * vendor's field names.
 *
 * Expected body:
 *   { to: string | string[], from: string, subject?: string,
 *     attachments: [{ filename, contentType?, size? }] }
 */

interface InboundAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
}

export async function POST(req: Request) {
  const secret = process.env.INBOUND_TOKEN;
  if (!secret) {
    return NextResponse.json({ error: "INBOUND_TOKEN is not configured; intake is disabled" }, { status: 403 });
  }
  if (req.headers.get("x-inbound-token") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: {
    to?: string | string[];
    from?: string;
    subject?: string;
    attachments?: InboundAttachment[];
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const recipients = Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : [];
  const from = (payload.from ?? "").trim();
  const attachments = (payload.attachments ?? []).filter((a) => a.filename);

  if (attachments.length === 0) {
    // a reply with no attachment is a conversation, not a delivery
    return NextResponse.json({ ok: true, stored: 0, note: "no attachments" });
  }

  // 1. the address replied to may name the filing outright
  const tokenFilingId = filingFromRecipients(recipients);

  // 2. otherwise the sender may identify the client
  const client = from ? await clientByEmail(from) : undefined;

  const candidates = await matchCandidates(client?.id);

  // A token names its filing outright, so load that filing directly rather
  // than hoping it falls inside the candidate window — a reply about a filing
  // due next March is still a reply about that filing.
  if (tokenFilingId && !candidates.some((c) => c.id === tokenFilingId)) {
    const named = await getFiling(tokenFilingId);
    if (named) {
      candidates.push({
        id: named.id,
        clientId: named.client_id,
        docsOutstanding: named.docsOutstanding,
        title: named.title,
        periodLabel: named.period_label,
      });
    }
  }

  const results = [];
  for (const a of attachments) {
    const fileName = a.filename as string;
    const match = matchDocument({
      tokenFilingId,
      fileName,
      clientId: client?.id ?? null,
      candidates,
    });

    const id = await recordDocument({
      filingId: match.filingId,
      clientId: client?.id ?? candidates.find((c) => c.id === match.filingId)?.clientId ?? null,
      docLabel: match.docLabel,
      fileName,
      contentType: a.contentType ?? null,
      sizeBytes: a.size ?? null,
      // binary storage is not wired yet; metadata is recorded so the matching
      // pipeline is exercisable and nothing arrives silently
      storagePath: null,
      source: "EMAIL",
      fromAddress: from || null,
      subject: payload.subject ?? null,
      matchedBy: match.matchedBy,
    });

    if (match.filingId && match.docLabel) {
      await markDocReceived(match.filingId, match.docLabel);
    }

    results.push({
      id,
      fileName,
      filingId: match.filingId,
      docLabel: match.docLabel,
      matchedBy: match.matchedBy ?? "UNMATCHED",
    });
  }

  const matched = results.filter((r) => r.filingId).length;
  return NextResponse.json({
    ok: true,
    stored: results.length,
    matched,
    unmatched: results.length - matched,
    results,
  });
}
