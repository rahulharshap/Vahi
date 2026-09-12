import Link from "next/link";
import {
  CATEGORY_LABEL,
  ENTITY_LABEL,
  RULES,
  generateOccurrences,
  obligationsFor,
  type Category,
  type ClientProfile,
  type EntityType,
  type GstScheme,
} from "@/lib/compliance";
import { todayISO, addDays } from "@/lib/store";
import { CategoryTag, SectionHead, prettyDate } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * What Vahi knows.
 *
 * Every statutory obligation, who it applies to, when it falls due and which
 * documents it needs — read from the same RULES array that actually generates
 * filings, not a copy. If this page is wrong, the engine is wrong.
 *
 * The profile builder runs the real predicates: toggling a flag shows exactly
 * which obligations that client would owe and on what dates. That makes it the
 * one screen worth putting in front of a CA, because they can check coverage
 * against their own practice in about a minute.
 */

const CATEGORIES: Category[] = ["GST", "INCOME_TAX", "TDS", "ROC", "PAYROLL"];
const ENTITIES: EntityType[] = ["PROPRIETOR", "PARTNERSHIP", "LLP", "PVT_LTD", "TRUST", "INDIVIDUAL"];
const SCHEMES: GstScheme[] = ["NONE", "MONTHLY", "QRMP", "COMPOSITION"];
const SCHEME_LABEL: Record<GstScheme, string> = {
  NONE: "No GST",
  MONTHLY: "GST monthly",
  QRMP: "GST QRMP",
  COMPOSITION: "Composition",
};

type SP = {
  entity?: string;
  gst?: string;
  tds?: string;
  staff?: string;
  audit?: string;
  state?: string;
};

export default async function Rules({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const profile: ClientProfile = {
    id: "preview",
    name: "Sample client",
    entityType: (ENTITIES.includes(sp.entity as EntityType) ? sp.entity : "PVT_LTD") as EntityType,
    pan: "AAACT1234A",
    gstin: null,
    gstScheme: (SCHEMES.includes(sp.gst as GstScheme) ? sp.gst : "MONTHLY") as GstScheme,
    tdsDeductor: sp.tds !== "0",
    hasEmployees: sp.staff !== "0",
    taxAudit: sp.audit !== "0",
    directorCount: 2,
    state: sp.state === "AP" ? "Andhra Pradesh" : "Telangana",
  };

  const applicable = obligationsFor(profile);
  const applicableCodes = new Set(applicable.map((r) => r.code));

  // a full financial year, so the counts are the real annual load
  const today = todayISO();
  const occurrences = generateOccurrences(profile, today, addDays(today, 365));
  const countByCode = new Map<string, number>();
  const nextByCode = new Map<string, string>();
  for (const o of occurrences) {
    countByCode.set(o.obligationCode, (countByCode.get(o.obligationCode) ?? 0) + 1);
    if (!nextByCode.has(o.obligationCode)) nextByCode.set(o.obligationCode, o.dueDate);
  }

  const qs = (over: Partial<SP>) => {
    const base: Record<string, string> = {
      entity: profile.entityType,
      gst: profile.gstScheme,
      tds: profile.tdsDeductor ? "1" : "0",
      staff: profile.hasEmployees ? "1" : "0",
      audit: profile.taxAudit ? "1" : "0",
      state: profile.state === "Andhra Pradesh" ? "AP" : "TS",
    };
    return "/rules?" + new URLSearchParams({ ...base, ...(over as Record<string, string>) }).toString();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          What Vahi tracks
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">
          Every statutory obligation the engine knows, read from the same rules that generate real filings.
          Change the profile below and the list narrows to exactly what that client would owe, on the dates they
          would owe it.
        </p>
      </header>

      <section className="card p-4">
        <SectionHead
          title="Sample client profile"
          action={
            <span className="tnum text-[11px] text-ink-3">
              {applicable.length} obligations · {occurrences.length} filings a year
            </span>
          }
        />

        <div className="space-y-2.5">
          <Row label="Entity">
            {ENTITIES.map((e) => (
              <Chip key={e} href={qs({ entity: e })} on={profile.entityType === e}>
                {ENTITY_LABEL[e]}
              </Chip>
            ))}
          </Row>
          <Row label="GST">
            {SCHEMES.map((g) => (
              <Chip key={g} href={qs({ gst: g })} on={profile.gstScheme === g}>
                {SCHEME_LABEL[g]}
              </Chip>
            ))}
          </Row>
          <Row label="Also">
            <Chip href={qs({ tds: profile.tdsDeductor ? "0" : "1" })} on={profile.tdsDeductor}>
              Deducts TDS
            </Chip>
            <Chip href={qs({ staff: profile.hasEmployees ? "0" : "1" })} on={profile.hasEmployees}>
              Has employees
            </Chip>
            <Chip href={qs({ audit: profile.taxAudit ? "0" : "1" })} on={profile.taxAudit}>
              Tax audit case
            </Chip>
          </Row>
          <Row label="State">
            <Chip href={qs({ state: "TS" })} on={profile.state === "Telangana"}>
              Telangana
            </Chip>
            <Chip href={qs({ state: "AP" })} on={profile.state === "Andhra Pradesh"}>
              Andhra Pradesh
            </Chip>
          </Row>
        </div>

        <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-snug text-ink-3">
          A private limited company with everything switched on owes 14 obligations and 86 dated filings a year.
          A salaried individual owes one.
        </p>
      </section>

      {CATEGORIES.map((category) => {
        const rules = RULES.filter((r) => r.category === category);
        const hits = rules.filter((r) => applicableCodes.has(r.code)).length;
        return (
          <section key={category}>
            <SectionHead
              title={CATEGORY_LABEL[category]}
              count={rules.length}
              action={
                <span className="text-[11px] text-ink-3">
                  {hits} of {rules.length} apply to this profile
                </span>
              }
            />
            <div className="card divide-y divide-[color:var(--border)]">
              {rules.map((r) => {
                const applies = applicableCodes.has(r.code);
                const count = countByCode.get(r.code) ?? 0;
                const next = nextByCode.get(r.code);
                return (
                  <article key={r.code} className={"px-4 py-3.5 " + (applies ? "" : "opacity-45")}>
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13.5px] font-bold text-ink">{r.title}</h3>
                          <code className="font-mono text-[10.5px] text-ink-3">{r.code}</code>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-ink-3">
                          Filed with {r.authority} · {r.schedule}
                        </p>
                      </div>
                      {applies ? (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="pill" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
                            {count}× a year
                          </span>
                          {next ? (
                            <span className="tnum text-[11px] text-ink-3">next {prettyDate(next)}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="pill" style={{ background: "var(--calm-soft)", color: "var(--text-3)" }}>
                          Not applicable
                        </span>
                      )}
                    </div>

                    <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
                      <div>
                        <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
                          Applies when
                        </dt>
                        <dd className="text-ink-2">{r.appliesWhen}</dd>
                      </div>
                      <div>
                        <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
                          If missed
                        </dt>
                        <dd className="text-ink-2">{r.penaltyNote}</dd>
                      </div>
                    </dl>

                    {r.docsRequired.length ? (
                      <div className="mt-2">
                        <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
                          Documents chased from the client
                        </div>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {r.docsRequired.map((d) => (
                            <li
                              key={d}
                              className="rounded-md bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2"
                            >
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="card p-4">
        <SectionHead title="Missing something?" />
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          These {RULES.length} obligations cover the traditional compliance load. Practices with particular
          specialisms — startups, exporters, NGOs — carry others that are not here yet. If you can name the form,
          it can be added: each rule is roughly fifteen lines, and the engine regenerates every client&rsquo;s
          calendar the moment it exists.
        </p>
        <p className="mt-2 text-[11.5px] text-ink-3">
          Statutory dates are the same for every firm and are not editable per tenant. Extensions are handled
          per filing, on the{" "}
          <Link href="/calendar" className="font-semibold text-brand">
            calendar
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <span className="w-12 shrink-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors " +
        (on ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3")
      }
    >
      {children}
    </Link>
  );
}
