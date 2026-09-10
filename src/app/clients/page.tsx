import Link from "next/link";
import { clientSummaries } from "@/lib/store";
import { ENTITY_LABEL } from "@/lib/compliance";
import { Empty, RiskPill, prettyDate, rupees } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Clients() {
  const rows = await clientSummaries();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">Clients</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {rows.length} on the roster · sorted by who needs attention
          </p>
        </div>
        <Link href="/clients/new" className="btn btn-primary ml-auto">
          Add client
        </Link>
      </header>

      {rows.length === 0 ? (
        <Empty title="No clients yet" hint="Add your first client and the compliance calendar builds itself." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ client: c, open, overdue, exposure, worst, next }) => (
            <Link
              key={c.id}
              href={"/clients/" + c.id}
              className="card flex flex-col gap-2.5 p-4"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold leading-tight text-ink">{c.name}</div>
                  <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                    {ENTITY_LABEL[c.entity_type]}
                    {c.gstin ? " · GST " + c.gst_scheme.toLowerCase() : " · no GST"}
                  </div>
                </div>
                <RiskPill risk={worst} compact />
              </div>

              <div className="flex items-center gap-3 text-[11.5px]">
                <span className="tnum font-semibold text-ink-2">{open} open</span>
                {overdue ? (
                  <span className="tnum font-bold" style={{ color: "var(--danger)" }}>
                    {overdue} overdue
                  </span>
                ) : null}
                {exposure > 0 ? <span className="tnum ml-auto text-ink-3">{rupees(exposure)}</span> : null}
              </div>

              <div className="mt-auto border-t border-line pt-2 text-[11.5px] text-ink-3">
                {next ? (
                  <>
                    Next: <span className="font-semibold text-ink-2">{next.title}</span> ·{" "}
                    <span className="tnum">{prettyDate(next.effectiveDue)}</span>
                  </>
                ) : (
                  "Nothing upcoming"
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
