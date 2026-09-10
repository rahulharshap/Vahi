import Link from "next/link";
import { listClients, listFilings, addDays, todayISO } from "@/lib/store";
import { ENTITY_LABEL } from "@/lib/compliance";
import { Empty, RiskPill, prettyDate, rupees } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Clients() {
  const clients = await listClients();
  const today = todayISO();

  const rows = await Promise.all(clients.map(async (c) => {
    const filings = await listFilings({ clientId: c.id, from: addDays(today, -200), to: addDays(today, 200) });
    const open = filings.filter((f) => f.status !== "FILED" && f.status !== "NOT_APPLICABLE");
    const overdue = open.filter((f) => f.risk === "OVERDUE");
    const next = open.filter((f) => f.daysLeft >= 0)[0];
    const exposure = open.reduce((s, f) => s + f.exposure, 0);
    const worst = overdue.length ? "OVERDUE" : open.some((f) => f.risk === "CRITICAL") ? "CRITICAL" : open.some((f) => f.risk === "AT_RISK") ? "AT_RISK" : "ON_TRACK";
    return { c, open: open.length, overdue: overdue.length, next, exposure, worst: worst as never };
  }));

  const sorted = [...rows].sort((a, b) => b.overdue - a.overdue || b.exposure - a.exposure);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">Clients</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {clients.length} on the roster · sorted by who needs attention
          </p>
        </div>
        <Link href="/clients/new" className="btn btn-primary ml-auto">
          Add client
        </Link>
      </header>

      {sorted.length === 0 ? (
        <Empty title="No clients yet" hint="Add your first client and the compliance calendar builds itself." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(({ c, open, overdue, next, exposure, worst }) => (
            <Link
              key={c.id}
              href={"/clients/" + c.id}
              className="card flex flex-col gap-2.5 p-4 transition-transform hover:-translate-y-0.5"
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
