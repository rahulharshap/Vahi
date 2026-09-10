import Link from "next/link";
import { addDays, listFilings, todayISO, type FilingView } from "@/lib/store";
import { CATEGORY_LABEL, type Category } from "@/lib/compliance";
import FilingRow from "@/components/FilingRow";
import { Empty, prettyDate, rupees } from "@/components/ui";

export const dynamic = "force-dynamic";

const CATEGORIES: Array<Category | "ALL"> = ["ALL", "GST", "INCOME_TAX", "TDS", "ROC", "PAYROLL"];
const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "60", label: "60 days", days: 60 },
  { key: "90", label: "90 days", days: 90 },
  { key: "180", label: "6 months", days: 180 },
];

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; range?: string; open?: string }>;
}) {
  const sp = await searchParams;
  const cat = (sp.cat ?? "ALL") as Category | "ALL";
  const rangeKey = sp.range ?? "90";
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
  const openOnly = sp.open !== "0";

  const today = todayISO();
  let rows = await listFilings({
    from: addDays(today, -60),
    to: addDays(today, range.days),
    category: cat === "ALL" ? undefined : cat,
  });
  if (openOnly) rows = rows.filter((f) => f.status !== "FILED" && f.status !== "NOT_APPLICABLE");

  const groups = new Map<string, FilingView[]>();
  for (const f of rows) {
    const key = f.effectiveDue.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ cat, range: rangeKey, open: openOnly ? "1" : "0", ...over });
    return "/calendar?" + p.toString();
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          Filing calendar
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Every statutory date derived from each client&rsquo;s profile. Nothing is typed in by hand.
        </p>
      </header>

      <div className="space-y-2.5">
        <div className="scroll-x -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-1.5">
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={qs({ cat: c })}
                className={
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                  (cat === c ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3")
                }
              >
                {c === "ALL" ? "All heads" : CATEGORY_LABEL[c]}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={qs({ range: r.key })}
              className={
                "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                (rangeKey === r.key ? "bg-surface-3 text-ink" : "text-ink-3 hover:bg-surface-2")
              }
            >
              {r.label}
            </Link>
          ))}
          <Link
            href={qs({ open: openOnly ? "0" : "1" })}
            className={
              "ml-auto rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors " +
              (openOnly ? "bg-surface-3 text-ink" : "text-ink-3 hover:bg-surface-2")
            }
          >
            {openOnly ? "Open only" : "Showing filed too"}
          </Link>
        </div>
      </div>

      {groups.size === 0 ? (
        <Empty title="Nothing in this window" hint="Widen the range or clear the category filter." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([month, items]) => {
            const [y, m] = month.split("-").map(Number);
            const exposure = items.reduce((s, f) => s + f.exposure, 0);
            const late = items.filter((f) => f.risk === "OVERDUE").length;
            return (
              <section key={month}>
                <div className="sticky top-[57px] z-20 -mx-4 mb-2 flex items-center gap-2 border-b border-line bg-[color:var(--bg)]/95 px-4 py-2 backdrop-blur-sm md:mx-0 md:px-0">
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-ink">
                    {MONTH_FULL[m - 1]} {y}
                  </h2>
                  <span className="tnum rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] font-bold text-ink-2">
                    {items.length}
                  </span>
                  {late ? (
                    <span className="tnum text-[11.5px] font-bold" style={{ color: "var(--danger)" }}>
                      {late} late
                    </span>
                  ) : null}
                  {exposure > 0 ? (
                    <span className="tnum ml-auto text-[11.5px] font-semibold text-ink-3">
                      {rupees(exposure)} exposure
                    </span>
                  ) : null}
                </div>
                <div className="card overflow-hidden">
                  {items.map((f) => (
                    <FilingRow key={f.id} f={f} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="pt-2 text-[11.5px] text-ink-3">
        Showing {rows.length} filings from {prettyDate(addDays(today, -60))} to{" "}
        {prettyDate(addDays(today, range.days))}.
      </p>
    </div>
  );
}
