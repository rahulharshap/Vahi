import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, getClient, listFilings, todayISO, toProfile } from "@/lib/store";
import { obligationsFor, ENTITY_LABEL, CATEGORY_LABEL } from "@/lib/compliance";
import FilingRow from "@/components/FilingRow";
import { Empty, SectionHead, Stat, rupees } from "@/components/ui";
import { deleteClientAction, markAllFiledForClient } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getClient(id);
  if (!c) notFound();

  const today = todayISO();
  const filings = await listFilings({ clientId: id, from: addDays(today, -200), to: addDays(today, 200) });
  const open = filings.filter((f) => f.status !== "FILED" && f.status !== "NOT_APPLICABLE");
  const overdue = open.filter((f) => f.risk === "OVERDUE");
  const upcoming = open.filter((f) => f.daysLeft >= 0);
  const filed = filings.filter((f) => f.status === "FILED");
  const exposure = open.reduce((s, f) => s + f.exposure, 0);
  const rules = obligationsFor(toProfile(c));

  const del = deleteClientAction.bind(null, id);
  const markFiled = markAllFiledForClient.bind(null, id);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/clients" className="text-[12px] font-semibold text-ink-3 hover:text-ink">
          ← Clients
        </Link>
        <div className="mt-1 flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">{c.name}</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {ENTITY_LABEL[c.entity_type]} · {c.state}
              {c.pan ? " · PAN " + c.pan : ""}
              {c.gstin ? " · GSTIN " + c.gstin : ""}
            </p>
            {c.contact_name ? (
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                Chasing {c.contact_name} on {c.contact_phone ?? "no number"}
              </p>
            ) : null}
          </div>
          <div className="ml-auto flex gap-2">
            <Link href={"/clients/" + id + "/edit"} className="btn">
              Edit
            </Link>
            <form action={del}>
              <button className="btn btn-ghost" type="submit">
                Delete
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open filings" value={String(open.length)} />
        <Stat label="Overdue" value={String(overdue.length)} tone={overdue.length ? "danger" : "ok"} />
        <Stat label="Exposure" value={rupees(exposure)} tone={exposure > 20000 ? "danger" : "warn"} />
        <Stat label="Filed (window)" value={String(filed.length)} tone="ok" />
      </section>

      <section className="card p-4">
        <SectionHead title="Obligations derived from this profile" count={rules.length} />
        <div className="flex flex-wrap gap-1.5">
          {rules.map((r) => (
            <span
              key={r.code}
              className="pill"
              style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              title={CATEGORY_LABEL[r.category] + " · " + r.authority}
            >
              {r.title}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
          Change a registration flag on the edit screen and this list, and the calendar, regenerate immediately.
        </p>
      </section>

      {overdue.length ? (
        <section>
          <SectionHead
            title="Overdue"
            count={overdue.length}
            tone="var(--danger)"
            action={
              <form action={markFiled}>
                <button className="btn btn-ghost text-[12px]" type="submit">
                  Mark all past-due filed
                </button>
              </form>
            }
          />
          <div className="card overflow-hidden">
            {overdue.map((f) => (
              <FilingRow key={f.id} f={f} showClient={false} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHead title="Upcoming" count={upcoming.length} />
        {upcoming.length ? (
          <div className="card overflow-hidden">
            {upcoming.map((f) => (
              <FilingRow key={f.id} f={f} showClient={false} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing upcoming in the window" />
        )}
      </section>

      {filed.length ? (
        <section>
          <SectionHead title="Filed" count={filed.length} tone="var(--ok)" />
          <div className="card max-h-96 overflow-y-auto">
            {filed.map((f) => (
              <FilingRow key={f.id} f={f} showClient={false} dense />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
