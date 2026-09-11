import Link from "next/link";
import { firm, pendingChases, recentMessages } from "@/lib/store";
import { composeChase, STAGE_LABEL, type Stage } from "@/lib/whatsapp";
import { Empty, SectionHead, prettyDate } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import { sendAllChasesAction, sendChaseAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const STAGE_TONE: Record<Stage, string> = {
  T10: "var(--calm)",
  T5: "var(--warn)",
  T2: "var(--warn)",
  T1: "var(--danger)",
  OVERDUE: "var(--danger)",
};

const PAGE = 20;

export default async function Chases({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const term = sp.q?.trim().toLowerCase();
  const allQueued = await pendingChases();
  const matched = term
    ? allQueued.filter(
        ({ filing }) =>
          filing.clientName.toLowerCase().includes(term) || filing.title.toLowerCase().includes(term),
      )
    : allQueued;
  // Each card carries a full message body; rendering hundreds up front is a
  // lot of markup for work that gets done a few at a time.
  const showAll = sp.all === "1";
  const queue = showAll ? matched : matched.slice(0, PAGE);
  const hidden = matched.length - queue.length;
  const history = await recentMessages(25);
  const f = await firm();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
            Document chases
          </h1>
          <p className="mt-0.5 max-w-xl text-[13px] text-ink-3">
            Clients who owe you documents, with the message already written. The system does the nagging so your
            team does not have to.
          </p>
        </div>
        {allQueued.length ? (
          <form action={sendAllChasesAction} className="ml-auto">
            <button className="btn btn-primary" type="submit">
              Send all {allQueued.length}
            </button>
          </form>
        ) : null}
      </header>

      <SearchBox placeholder="Search client or filing" />

      {!process.env.WA_PROVIDER ? (
        <div
          className="rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-snug"
          style={{ background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          <strong>Dev mode.</strong> No WhatsApp provider configured, so sends are recorded locally instead of
          delivered. Set <code className="font-mono">WA_PROVIDER</code> and add a BSP adapter in{" "}
          <code className="font-mono">src/lib/whatsapp.ts</code> to go live.
        </div>
      ) : null}

      <section>
        <SectionHead title={term ? "Matching “" + sp.q + "”" : "Queued now"} count={matched.length} />
        {queue.length ? (
          <div className="space-y-3">
            {queue.map(({ filing, stage }) => {
              const body = composeChase(stage, {
                clientName: filing.clientName,
                contactName: filing.contactName,
                filingTitle: filing.title,
                periodLabel: filing.period_label,
                dueDate: filing.effectiveDue,
                docsOutstanding: filing.docsOutstanding,
                firmName: f.name,
                penaltyNote: filing.penalty_note,
              });
              const send = sendChaseAction.bind(null, filing.id, stage);
              return (
                <article key={filing.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
                    <Link href={"/filings/" + filing.id} className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold text-ink">{filing.clientName}</div>
                      <div className="truncate text-[12px] text-ink-3">
                        {filing.title} · {filing.period_label}
                      </div>
                    </Link>
                    <span
                      className="pill ml-auto"
                      style={{ background: "var(--surface-3)", color: STAGE_TONE[stage] }}
                    >
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="tnum text-[11.5px] font-semibold text-ink-3">
                      due {prettyDate(filing.effectiveDue)}
                    </span>
                  </div>

                  <pre className="scroll-x max-h-52 overflow-y-auto whitespace-pre-wrap px-3.5 py-3 font-sans text-[12.5px] leading-relaxed text-ink-2">
                    {body}
                  </pre>

                  <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-3.5 py-2.5">
                    <span className="truncate text-[11.5px] text-ink-3">
                      → {filing.contactName ?? filing.clientName} · {filing.contactPhone ?? "no number on file"}
                    </span>
                    <form action={send} className="ml-auto">
                      <button className="btn btn-primary" type="submit" disabled={!filing.contactPhone}>
                        Send
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={term ? "No queued chase matches “" + sp.q + "”" : "Nothing to chase"}
            hint={
              term
                ? "Try part of the client name or the filing."
                : "Every client with a deadline inside the next 10 days has already been messaged at the right stage."
            }
          />
        )}
        {hidden > 0 ? (
          <div className="mt-3 text-center">
            <Link
              href={"/chases?all=1" + (sp.q ? "&q=" + encodeURIComponent(sp.q) : "")}
              className="btn"
            >
              Show {hidden} more
            </Link>
          </div>
        ) : null}
      </section>

      <section>
        <SectionHead title="Recently sent" count={history.length} />
        {history.length ? (
          <div className="card divide-y divide-[color:var(--border)]">
            {history.map((m) => (
              <div key={m.id} className="flex items-start gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{m.clientname}</div>
                  <div className="truncate text-[11.5px] text-ink-3">{m.title}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="pill" style={{ background: "var(--surface-3)", color: STAGE_TONE[m.stage] }}>
                    {STAGE_LABEL[m.stage]}
                  </span>
                  <span className="tnum text-[11px] text-ink-3">{prettyDate(m.sent_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No messages sent yet" />
        )}
      </section>
    </div>
  );
}
