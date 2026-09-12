import Link from "next/link";
import { matchCandidates, unmatchedDocuments } from "@/lib/store";
import { INTAKE_DOMAIN } from "@/lib/intake";
import { Empty, SectionHead, prettyDate } from "@/components/ui";
import { assignDocumentAction } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * Documents that arrived but could not be placed.
 *
 * This screen exists so that nothing arrives silently. A document the system
 * cannot match is visible here and assigned in one action; the alternative —
 * guessing — would file a bank statement against the wrong return with nobody
 * the wiser.
 */
export default async function Inbox() {
  const docs = await unmatchedDocuments();
  const candidates = await matchCandidates();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          Unmatched documents
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">
          Files that arrived without enough information to place them — no reply token, an unrecognised sender,
          or several open filings that all fit. Assign one and its checklist entry ticks itself.
        </p>
      </header>

      <section
        className="rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed"
        style={{ background: "var(--brand-soft)", borderColor: "var(--brand)", color: "var(--brand-ink)" }}
      >
        <strong>How documents arrive.</strong> Every chase email carries a reply address that names the filing,
        so a reply with attachments files itself. Anything that cannot be placed lands here instead of being
        guessed at.
        <div className="mt-1.5 font-mono text-[11.5px] opacity-80">docs+&lt;filing token&gt;@{INTAKE_DOMAIN}</div>
      </section>

      <section>
        <SectionHead title="Waiting for triage" count={docs.length} />
        {docs.length === 0 ? (
          <Empty
            title="Nothing unmatched"
            hint="Every document that has arrived was placed against a filing automatically."
          />
        ) : (
          <div className="space-y-3">
            {docs.map((d) => {
              const assign = assignDocumentAction.bind(null, d.id);
              return (
                <article key={d.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13px] font-semibold text-ink">{d.file_name}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {d.source === "EMAIL" ? "Email" : d.source === "WHATSAPP" ? "WhatsApp" : "Upload"}
                        {d.from_address ? " from " + d.from_address : " from an unknown sender"}
                        {" · "}
                        {prettyDate(d.received_at)}
                      </div>
                      {d.subject ? (
                        <div className="mt-1 truncate text-[12px] italic text-ink-2">&ldquo;{d.subject}&rdquo;</div>
                      ) : null}
                    </div>
                    <span className="pill" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                      Unmatched
                    </span>
                  </div>

                  <form action={assign} className="mt-3 flex flex-wrap gap-2">
                    <select name="target" className="field sm:max-w-md" aria-label="Assign to filing">
                      {candidates.length === 0 ? <option value="">No open filings</option> : null}
                      {candidates.map((c) =>
                        c.docsOutstanding.length === 0 ? null : (
                          <optgroup key={c.id} label={c.title + " · " + c.periodLabel}>
                            {c.docsOutstanding.map((doc) => (
                              <option key={c.id + doc} value={c.id + "::" + doc}>
                                {doc}
                              </option>
                            ))}
                          </optgroup>
                        ),
                      )}
                    </select>
                    <button className="btn btn-primary" type="submit" disabled={candidates.length === 0}>
                      Assign
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-[11.5px] text-ink-3">
        Looking for a document that was placed correctly? It appears on its{" "}
        <Link href="/calendar" className="font-semibold text-brand">
          filing
        </Link>
        , not here.
      </p>
    </div>
  );
}
