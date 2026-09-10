import Link from "next/link";
import { notFound } from "next/navigation";
import { assignees, dueStage, firm, getFiling, listMessages, STATUS_LABEL, type FilingStatus } from "@/lib/store";
import { composeChase, STAGE_LABEL } from "@/lib/whatsapp";
import { CATEGORY_LABEL } from "@/lib/compliance";
import { CategoryTag, DueLabel, Empty, RiskPill, SectionHead, StatusPill, prettyDate, rupees } from "@/components/ui";
import { sendChaseAction, setAssigneeAction, setExtendedDueAction, setNotesAction, setStatusAction, toggleDocAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const STATUSES: FilingStatus[] = ["AWAITING_DOCS", "DOCS_RECEIVED", "IN_PROGRESS", "FILED", "NOT_APPLICABLE"];

export default async function FilingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await getFiling(id);
  if (!f) notFound();

  const messages = await listMessages(id);
  const stage = dueStage(f);
  const extend = setExtendedDueAction.bind(null, id);
  const assign = setAssigneeAction.bind(null, id);
  const note = setNotesAction.bind(null, id);
  const team = await assignees();

  const preview = f.docsOutstanding.length
    ? composeChase(stage ?? "T10", {
        clientName: f.clientName,
        contactName: f.contactName,
        filingTitle: f.title,
        periodLabel: f.period_label,
        dueDate: f.effectiveDue,
        docsOutstanding: f.docsOutstanding,
        firmName: (await firm()).name,
        penaltyNote: f.penalty_note,
      })
    : null;

  return (
    <div className="space-y-6">
      <header>
        <Link href={"/clients/" + f.client_id} className="text-[12px] font-semibold text-ink-3 hover:text-ink">
          ← {f.clientName}
        </Link>
        <div className="mt-1 flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-tight tracking-tight text-ink md:text-[24px]">{f.title}</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {f.period_label} · {CATEGORY_LABEL[f.category]} · {f.authority}
            </p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <RiskPill risk={f.risk} />
            <DueLabel f={f} />
          </div>
        </div>
      </header>

      {f.risk === "OVERDUE" || f.risk === "CRITICAL" ? (
        <div
          className="rounded-xl border px-3.5 py-3 text-[12.5px] leading-snug"
          style={{ background: "var(--danger-soft)", borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          <strong className="tnum">{rupees(f.exposure)} estimated exposure.</strong>{" "}
          {f.penalty_note ?? "Penalty applies once the statutory date passes."}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <section className="card p-4">
            <SectionHead title="Documents needed from the client" count={f.docsRequiredList.length} />
            {f.docsRequiredList.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No client documents are required for this filing.</p>
            ) : (
              <ul className="space-y-1.5">
                {f.docsRequiredList.map((doc) => {
                  const have = f.docsReceivedList.includes(doc);
                  const toggle = toggleDocAction.bind(null, id, doc);
                  return (
                    <li key={doc}>
                      <form action={toggle}>
                        <button
                          type="submit"
                          className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <span
                            aria-hidden
                            className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-black"
                            style={
                              have
                                ? { background: "var(--ok)", borderColor: "var(--ok)", color: "#fff" }
                                : { borderColor: "var(--border-strong)", color: "transparent" }
                            }
                          >
                            ✓
                          </span>
                          <span
                            className={"text-[13px] leading-snug " + (have ? "text-ink-3 line-through" : "text-ink")}
                          >
                            {doc}
                          </span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <SectionHead title="Chase history" count={messages.length} />
            {preview ? (
              <div className="mb-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
                    {stage ? "Next chase · " + STAGE_LABEL[stage] : "Draft message"}
                  </span>
                  {stage ? (
                    <form action={sendChaseAction.bind(null, id, stage)} className="ml-auto">
                      <button className="btn btn-primary" type="submit" disabled={!f.contactPhone}>
                        Send now
                      </button>
                    </form>
                  ) : (
                    <span className="ml-auto text-[11px] text-ink-3">Already sent for this stage</span>
                  )}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">{preview}</pre>
              </div>
            ) : null}

            {messages.length ? (
              <ol className="space-y-2.5">
                {messages.map((m) => (
                  <li key={m.id} className="border-l-2 border-line pl-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11.5px] font-bold text-ink-2">{STAGE_LABEL[m.stage]}</span>
                      <span className="tnum text-[11px] text-ink-3">{prettyDate(m.sent_at)}</span>
                      <span className="pill ml-auto" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
                        {m.status}
                      </span>
                    </div>
                    <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-3">
                      {m.body}
                    </pre>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty title="No chases sent yet" />
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-4">
            <SectionHead title="Status" />
            <div className="mb-3">
              <StatusPill status={f.status} />
            </div>
            <div className="grid gap-1.5">
              {STATUSES.map((s) => {
                const set = setStatusAction.bind(null, id, s);
                const active = f.status === s;
                return (
                  <form key={s} action={set}>
                    <button
                      type="submit"
                      disabled={active}
                      className={
                        "w-full rounded-lg border px-3 py-2 text-left text-[13px] font-semibold transition-colors " +
                        (active
                          ? "border-brand bg-brand-soft text-brand-ink"
                          : "border-line bg-surface hover:bg-surface-2 text-ink-2")
                      }
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  </form>
                );
              })}
            </div>
            {f.filed_at ? (
              <p className="mt-3 text-[11.5px] text-ink-3">Filed {prettyDate(f.filed_at)}</p>
            ) : null}
          </section>

          <section className="card p-4">
            <SectionHead title="Owner" />
            <form action={assign} className="flex gap-2">
              <input
                name="assignee"
                defaultValue={f.assignee ?? ""}
                list="vahi-team"
                placeholder="Unassigned"
                aria-label="Assign to"
                className="field"
              />
              <button className="btn" type="submit">
                Save
              </button>
            </form>
            <datalist id="vahi-team">
              {team.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="mt-2 text-[11px] leading-snug text-ink-3">
              Who is preparing this. Type a new name to add someone.
            </p>
          </section>

          <section className="card p-4">
            <SectionHead title="Notes" />
            <form action={note} className="space-y-2">
              <textarea
                name="notes"
                defaultValue={f.notes ?? ""}
                rows={4}
                placeholder="Client says invoices come after the 15th…"
                aria-label="Notes"
                className="field resize-y"
              />
              <button className="btn" type="submit">
                Save note
              </button>
            </form>
          </section>

          <section className="card p-4">
            <SectionHead title="Dates" />
            <dl className="space-y-2 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Statutory due</dt>
                <dd className="tnum font-semibold text-ink">{prettyDate(f.due_date)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Extended to</dt>
                <dd className="tnum font-semibold text-ink">
                  {f.extended_due ? prettyDate(f.extended_due) : "—"}
                </dd>
              </div>
            </dl>
            <form action={extend} className="mt-3 flex gap-2">
              <input
                type="date"
                name="extendedDue"
                defaultValue={f.extended_due ?? ""}
                className="field tnum"
                aria-label="Extended due date"
              />
              <button className="btn" type="submit">
                Set
              </button>
            </form>
            <p className="mt-2 text-[11px] leading-snug text-ink-3">
              Use this when CBDT or CBIC extends a date. It overrides the statutory date everywhere, including the
              chase schedule.
            </p>
          </section>

          <section className="card p-4">
            <SectionHead title="Reference" />
            <div className="space-y-2 text-[12px] leading-snug text-ink-3">
              <p>
                <span className="font-semibold text-ink-2">Filed with:</span> {f.authority}
              </p>
              <p>
                <span className="font-semibold text-ink-2">If missed:</span> {f.penalty_note ?? "—"}
              </p>
              <div className="pt-1">
                <CategoryTag category={f.category} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
