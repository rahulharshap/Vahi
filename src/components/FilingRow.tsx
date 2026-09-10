import Link from "next/link";
import type { FilingView } from "@/lib/store";
import { CategoryTag, DocProgress, DueLabel, RiskPill, rupees } from "./ui";

export default function FilingRow({
  f,
  showClient = true,
  dense = false,
}: {
  f: FilingView;
  showClient?: boolean;
  dense?: boolean;
}) {
  return (
    <Link
      href={"/filings/" + f.id}
      className="block border-b border-line px-3.5 py-3 transition-colors last:border-b-0 hover:bg-surface-2"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {showClient ? (
            <div className="truncate text-[13.5px] font-bold leading-tight text-ink">{f.clientName}</div>
          ) : null}
          <div className={"truncate text-[13px] leading-snug " + (showClient ? "text-ink-2" : "font-bold text-ink")}>
            {f.title}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">{f.period_label}</div>
          {!dense ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <CategoryTag category={f.category} />
              <DocProgress f={f} />
              {f.assignee ? (
                <span className="pill" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                  {f.assignee}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <RiskPill risk={f.risk} compact />
          <DueLabel f={f} />
          {f.exposure > 0 && (f.risk === "OVERDUE" || f.risk === "CRITICAL") ? (
            <span className="tnum text-[11px] font-bold" style={{ color: "var(--danger)" }}>
              {rupees(f.exposure)} at stake
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
