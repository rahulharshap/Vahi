import crypto from "node:crypto";

/**
 * Document intake: addressing, and working out which filing an arriving file
 * belongs to.
 *
 * The matching cascade is deliberately ordered cheapest-and-surest first. A
 * model is not in it at all — by the time you reach the end of this list the
 * remaining cases are genuinely ambiguous, and a wrong guess there files a
 * client's bank statement against the wrong return, silently. An unmatched
 * document sits in a tray where someone can see it; a misfiled one cannot be
 * seen at all, which makes it the worse outcome.
 */

const SECRET = process.env.INTAKE_SECRET ?? "vahi-dev-intake-secret";

/** Subdomain that carries the MX record, e.g. in.vahi.app */
export const INTAKE_DOMAIN = process.env.INTAKE_DOMAIN ?? "in.vahi.local";

// ------------------------------------------------------------------- tokens

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 16);
}

/**
 * Self-describing, tamper-evident filing token.
 *
 * The filing id travels in the address so inbound mail needs no lookup table,
 * and the signature stops someone editing the address to reach another firm's
 * filing. Not secret — it appears in a Reply-To header — so it grants only the
 * ability to attach a document to one filing, never to read anything.
 */
export function filingToken(filingId: string): string {
  return Buffer.from(filingId, "utf8").toString("base64url") + "." + sign(filingId);
}

export function verifyFilingToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  let filingId: string;
  try {
    filingId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!filingId || !/^[A-Za-z0-9_]+$/.test(filingId)) return null;
  const expected = sign(filingId);
  // constant-time compare; lengths are fixed so a length mismatch is a miss
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return filingId;
}

/** Reply-To address for a chase: docs+<token>@in.example.com */
export function replyAddress(filingId: string): string {
  return "docs+" + filingToken(filingId) + "@" + INTAKE_DOMAIN;
}

/** Pull a filing id out of any recipient address on an inbound message. */
export function filingFromRecipients(addresses: string[]): string | null {
  for (const raw of addresses) {
    // deliberately NOT lowercased: the token is base64url and case-sensitive,
    // so normalising the address destroys the signature
    const addr = raw.replace(/^.*</, "").replace(/>.*$/, "").trim();
    const m = addr.match(/\+([^@]+)@/);
    if (!m) continue;
    const filingId = verifyFilingToken(m[1]);
    if (filingId) return filingId;
  }
  return null;
}

// ----------------------------------------------------------------- matching

export interface MatchCandidate {
  id: string;
  clientId: string;
  docsOutstanding: string[];
  title: string;
  periodLabel: string;
}

export type MatchedBy = "TOKEN" | "SENDER" | "FILENAME" | "MANUAL";

export interface MatchResult {
  filingId: string | null;
  docLabel: string | null;
  matchedBy: MatchedBy | null;
}

/**
 * Which of a filing's required documents does this filename look like?
 *
 * Word overlap, not fuzzy scoring — "purchase_register_aug.pdf" against
 * "Purchase register / inward invoices" shares two meaningful words and that
 * is enough. Short and generic words are dropped so "bank statement for the
 * period" is not matched by "statement.pdf" alone when another candidate
 * fits better.
 */
const STOPWORDS = new Set([
  "and", "for", "the", "with", "any", "all", "per", "from", "into", "details",
  "register", "statement", "list", "sheet", "report", "period", "year", "month",
]);

export function labelFromFilename(
  fileName: string,
  docsOutstanding: string[],
  opts: { requireEvidence?: boolean } = {},
): string | null {
  if (docsOutstanding.length === 0) return null;
  // With the filing already known, one outstanding document needs no guessing.
  // When choosing BETWEEN filings this shortcut is wrong — it would make every
  // single-document filing match any filename at all — so callers doing that
  // pass requireEvidence and get a null unless the name actually overlaps.
  if (docsOutstanding.length === 1 && !opts.requireEvidence) return docsOutstanding[0];

  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const fileWords = new Set(words(fileName));
  if (fileWords.size === 0) return null;

  let best: { label: string; score: number } | null = null;
  let tied = false;
  for (const label of docsOutstanding) {
    let score = 0;
    for (const w of words(label)) if (fileWords.has(w)) score++;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { label, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  // a tie is not a match — two equally plausible answers is exactly the case
  // that should reach a human
  return best && !tied ? best.label : null;
}

/**
 * The cascade.
 *
 * 1. TOKEN    — the address the client replied to names the filing. Exact.
 * 2. SENDER   — the sender maps to a client with exactly one filing still
 *               awaiting documents. Unambiguous by elimination, and in a small
 *               practice this is most of the remainder.
 * 3. FILENAME — the file name overlaps one outstanding document and only one.
 *
 * Anything left is returned unmatched, on purpose.
 */
export function matchDocument(input: {
  tokenFilingId: string | null;
  fileName: string;
  clientId: string | null;
  candidates: MatchCandidate[];
}): MatchResult {
  const { tokenFilingId, fileName, clientId, candidates } = input;

  if (tokenFilingId) {
    const hit = candidates.find((c) => c.id === tokenFilingId);
    return {
      filingId: tokenFilingId,
      docLabel: hit ? labelFromFilename(fileName, hit.docsOutstanding) : null,
      matchedBy: "TOKEN",
    };
  }

  if (clientId) {
    const open = candidates.filter((c) => c.clientId === clientId && c.docsOutstanding.length > 0);
    if (open.length === 1) {
      return {
        filingId: open[0].id,
        docLabel: labelFromFilename(fileName, open[0].docsOutstanding),
        matchedBy: "SENDER",
      };
    }
    // several open filings: a filename may still single one out, but only on
    // real evidence — the name has to overlap that filing's document list
    const named = open.filter(
      (c) => labelFromFilename(fileName, c.docsOutstanding, { requireEvidence: true }) !== null,
    );
    if (named.length === 1) {
      return {
        filingId: named[0].id,
        docLabel: labelFromFilename(fileName, named[0].docsOutstanding, { requireEvidence: true }),
        matchedBy: "FILENAME",
      };
    }
  }

  return { filingId: null, docLabel: null, matchedBy: null };
}
