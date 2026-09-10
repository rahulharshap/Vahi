import Link from "next/link";
import { dashboard, RISK_LABEL, type FilingView } from "@/lib/store";
import { CATEGORY_LABEL } from "@/lib/compliance";
import FilingRow from "@/components/FilingRow";
import { Empty, SectionHead, Stat, prettyDate, rupees } from "@/components/ui";
import { resyncAction } from "./actions";

export const dynamic = "force-dynamic";

export default function Board() {
  const d = dashboard();
  const overdue = d.buckets.OVERDUE;
  const critical = d.buckets.CRITICAL;
  const atRisk = d.buckets.AT_RISK;
  const onTrack = d.buckets.ON_TRACK;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
            Compliance board
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {prettyDate(d.today)} · {d.clientCount} clients · everything due in the next 45 days
          </p>
        </div>
        <form action={resyncAction} className="ml-auto">
          <button className="btn" type="submit">
            Re-sync calendar
          </button>
        </form>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Penalty exposure"
          value={rupees(d.exposure)}
          sub="Estimated cost if every open item slips"
          tone={d.exposure > 100000 ? "danger" : "warn"}
        />
        <Stat
          label="Overdue"
          value={String(overdue.length)}
          sub={overdue.length ? "Past the statutory date" : "Nothing past due"}
          tone={overdue.length ? "danger" : "ok"}
        />
        <Stat
          label="Chases due today"
          value={String(d.chasesDue)}
          sub="Clients to nudge for documents"
          href="/chases"
          tone={d.chasesDue ? "warn" : "ok"}
        />
        <Stat label="Filed this month" value={String(d.filedThisMonth)} sub="Completed by the team" tone="ok" />
      </section>

      {d.byCategory.length ? (
        <section className="card p-4">
          <SectionHead title="Open work by head" />
          <div className="space-y-2.5">
            {d.byCategory.map((c) => {
              const max = Math.max(...d.byCategory.map((x) => x.open));
              return (
                <div key={c.category} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-[12px] font-semibold text-ink-2">
                    {CATEGORY_LABEL[c.category]}
                  </div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{ width: (c.open / max) * 100 + "%", background: "var(--brand)" }}
                    />
                  </div>
                  <div className="tnum w-20 shrink-0 text-right text-[12px] font-bold text-ink">
                    {c.open}
                    {c.overdue ? (
                      <span className="ml-1 font-semibold" style={{ color: "var(--danger)" }}>
                        ({c.overdue} late)
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Column
          title={RISK_LABEL.OVERDUE}
          tone="var(--danger)"
          rows={overdue}
          empty="Nothing overdue. Rare and good."
        />
        <Column
          title={RISK_LABEL.CRITICAL}
          tone="var(--danger)"
          rows={critical}
          empty="No critical items in the next 3 days."
        />
        <Column title={RISK_LABEL.AT_RISK} tone="var(--warn)" rows={atRisk} empty="Nothing at risk right now." />
      </div>

      <section>
        <SectionHead
          title="On track"
          count={onTrack.length}
          action={
            <Link href="/calendar" className="text-[12px] font-semibold text-brand">
              Full calendar →
            </Link>
          }
        />
        {onTrack.length ? (
          <div className="card overflow-hidden">
            {onTrack.slice(0, 8).map((f) => (
              <FilingRow key={f.id} f={f} dense />
            ))}
          </div>
        ) : (
          <Empty title="Nothing scheduled in the window" />
        )}
      </section>
    </div>
  );
}

function Column({
  title,
  tone,
  rows,
  empty,
}: {
  title: string;
  tone: string;
  rows: FilingView[];
  empty: string;
}) {
  return (
    <section>
      <SectionHead title={title} count={rows.length} tone={tone} />
      {rows.length ? (
        <div className="card max-h-[520px] overflow-y-auto">
          {rows.map((f) => (
            <FilingRow key={f.id} f={f} />
          ))}
        </div>
      ) : (
        <Empty title={empty} />
      )}
    </section>
  );
}
