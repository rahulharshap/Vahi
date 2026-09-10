import Link from "next/link";
import type { Risk, FilingStatus, FilingView } from "@/lib/store";
import { RISK_LABEL, STATUS_LABEL } from "@/lib/store";
import { CATEGORY_LABEL, type Category } from "@/lib/compliance";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(isoDate: string, withYear = true): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return d + " " + MONTHS[m - 1] + (withYear ? " " + String(y).slice(2) : "");
}

export function rupees(n: number): string {
  if (n >= 10000000) return "₹" + (n / 10000000).toFixed(2) + " Cr";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(2) + " L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(1) + "k";
  return "₹" + Math.round(n);
}

const RISK_STYLE: Record<Risk, { bg: string; fg: string }> = {
  OVERDUE: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  CRITICAL: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  AT_RISK: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  ON_TRACK: { bg: "var(--calm-soft)", fg: "var(--calm)" },
  FILED: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  NA: { bg: "var(--calm-soft)", fg: "var(--text-3)" },
};

export function RiskPill({ risk, compact = false }: { risk: Risk; compact?: boolean }) {
  const s = RISK_STYLE[risk];
  return (
    <span className="pill" style={{ background: s.bg, color: s.fg }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {compact ? RISK_LABEL[risk].split(" ")[0] : RISK_LABEL[risk]}
    </span>
  );
}

export function StatusPill({ status }: { status: FilingStatus }) {
  const tone =
    status === "FILED"
      ? { bg: "var(--ok-soft)", fg: "var(--ok)" }
      : status === "IN_PROGRESS"
        ? { bg: "var(--brand-soft)", fg: "var(--brand-ink)" }
        : status === "DOCS_RECEIVED"
          ? { bg: "var(--accent-soft)", fg: "var(--accent)" }
          : { bg: "var(--calm-soft)", fg: "var(--calm)" };
  return (
    <span className="pill" style={{ background: tone.bg, color: tone.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const CATEGORY_TONE: Record<Category, string> = {
  GST: "var(--brand)",
  INCOME_TAX: "var(--accent)",
  TDS: "#7c5cbf",
  ROC: "#2f8f83",
  PAYROLL: "#a8577a",
};

export function CategoryTag({ category }: { category: Category }) {
  return (
    <span
      className="pill"
      style={{ background: "transparent", color: CATEGORY_TONE[category], border: "1px solid currentColor", opacity: 0.9 }}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function DueLabel({ f }: { f: FilingView }) {
  const d = f.daysLeft;
  const text =
    d === 0 ? "due today" : d === 1 ? "due tomorrow" : d > 0 ? "in " + d + "d" : Math.abs(d) + "d late";
  const color = d < 0 ? "var(--danger)" : d <= 3 ? "var(--warn)" : "var(--text-3)";
  return (
    <span className="tnum text-[11px] font-semibold" style={{ color }}>
      {prettyDate(f.effectiveDue)} · {text}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "danger" | "warn" | "ok";
  href?: string;
}) {
  const fg =
    tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : "var(--text)";
  const body = (
    <div className="card h-full p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="tnum mt-1.5 text-2xl font-bold leading-none md:text-[28px]" style={{ color: fg }}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{sub}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

export function SectionHead({
  title,
  count,
  action,
  tone,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.07em]" style={{ color: tone ?? "var(--text-2)" }}>
        {title}
      </h2>
      {count !== undefined ? (
        <span className="tnum rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] font-bold text-ink-2">{count}</span>
      ) : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card grid place-items-center gap-1 px-4 py-10 text-center">
      <div className="text-sm font-semibold text-ink-2">{title}</div>
      {hint ? <div className="max-w-sm text-[12.5px] text-ink-3">{hint}</div> : null}
    </div>
  );
}

export function DocProgress({ f }: { f: FilingView }) {
  const total = f.docsRequiredList.length;
  const have = total - f.docsOutstanding.length;
  if (total === 0) return null;
  const pct = Math.round((have / total) * 100);
  const tone = pct === 100 ? "var(--ok)" : pct === 0 ? "var(--danger)" : "var(--warn)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: pct + "%", background: tone }} />
      </div>
      <span className="tnum text-[11px] font-semibold text-ink-3">
        {have}/{total} docs
      </span>
    </div>
  );
}
