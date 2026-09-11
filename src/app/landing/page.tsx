import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <Header />
      <main>
        <Hero />
        <Showcase />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header() {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-4 py-4 md:px-6">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand text-[15px] font-black text-white"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          व
        </span>
        <span className="text-[16px] font-bold tracking-tight text-ink">Vahi</span>
        <Link href="/board" className="btn btn-primary ml-auto">
          Open demo
        </Link>
      </nav>
    </header>
  );
}

/* -------------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-12 md:px-6 md:pb-20 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        <div className="flex flex-col justify-center lg:order-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">
            Compliance command centre for CA practices
          </p>
          <h1 className="mt-3 text-[32px] font-bold leading-[1.12] tracking-tight text-ink md:text-[42px]">
            You know the deadlines. Vahi ranks them by what missing one costs, then chases the
            documents in.
          </h1>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2 md:text-[16px]">
            Not a calendar — a risk board ranked by cost, and a chaser that escalates on its own.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#ladder" className="btn px-5 py-2.5 text-[14px]">
              See how the chasing works
            </a>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
            Live demo in the header. Sample data, fictional Hyderabad practice, no signup.
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:order-2">
          <RiskBoardMock />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- risk board mock */
/* Matches .tmp/variants/d-short.html's board exactly: stat tiles row, then
   ONE stacked column of full-width risk rows grouped by section label —
   not the old 3-across mini-columns (which cramped names into truncation). */

type StagePill = "st-danger" | "st-warn" | "st-calm";

const STAGE_STYLE: Record<StagePill, { bg: string; fg: string }> = {
  "st-danger": { bg: "var(--danger-soft)", fg: "var(--danger)" },
  "st-warn": { bg: "var(--warn-soft)", fg: "var(--text)" },
  "st-calm": { bg: "var(--calm-soft)", fg: "var(--calm)" },
};

// "when" (due-date) text uses the same two-tone read as the stage pill,
// collapsed to danger/calm — st-warn rows are still urgent, so they share
// danger's "when" color even though the pill itself reads softer.
const WHEN_COLOR: Record<StagePill, string> = {
  "st-danger": "var(--danger)",
  "st-warn": "var(--danger)",
  "st-calm": "var(--calm)",
};

type RiskRow = {
  client: string;
  filing: string;
  stage: string;
  stagePill: StagePill;
  when: string;
  stake?: string;
};

type RiskSection = { label: string; pill: StagePill; rows: RiskRow[] };

const RISK_BOARD: RiskSection[] = [
  {
    label: "Overdue",
    pill: "st-danger",
    rows: [
      { client: "Konda Constructions LLP", filing: "GSTR-3B · Aug 2026", stage: "Overdue", stagePill: "st-danger", when: "6d late", stake: "₹4.2k at stake" },
      { client: "Deccan Logistics Pvt Ltd", filing: "TDS 26Q · Q2 2026-27", stage: "Overdue", stagePill: "st-danger", when: "2d late", stake: "₹9.8k at stake" },
    ],
  },
  {
    label: "Critical",
    pill: "st-danger",
    rows: [
      { client: "Veda Software Labs Pvt Ltd", filing: "AOC-4 · FY 2025-26", stage: "T-2", stagePill: "st-warn", when: "in 2d", stake: "₹1.9L at stake" },
      { client: "Charminar Foods & Beverages", filing: "PF/ESI · Aug 2026", stage: "T-1", stagePill: "st-warn", when: "in 1d" },
    ],
  },
  {
    label: "At risk",
    pill: "st-calm",
    rows: [
      { client: "Sri Lakshmi Traders", filing: "GSTR-1 · Aug 2026", stage: "T-5", stagePill: "st-calm", when: "in 6d" },
      { client: "Padma Jewellers", filing: "CMP-08 · Q2 2026-27", stage: "T-10", stagePill: "st-calm", when: "in 8d" },
    ],
  },
];

function RiskBoardMock() {
  return (
    <div className="card overflow-hidden p-4 md:p-5" aria-hidden="true">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-ink">Risk board</h2>
        <span className="text-[12px] text-ink-2">Rao &amp; Associates · sample data</span>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="At stake" value="₹2.84L" tone="danger" />
        <MiniStat label="Overdue" value="3" tone="danger" />
        <MiniStat label="Chases due" value="6" tone="warn" />
        <MiniStat label="Filed" value="24" tone="ok" />
      </div>

      <div className="flex flex-col gap-2.5">
        {RISK_BOARD.map((section) => (
          <div key={section.label}>
            <span
              className="pill mb-1.5 inline-block"
              style={{ background: STAGE_STYLE[section.pill].bg, color: STAGE_STYLE[section.pill].fg }}
            >
              {section.label}
            </span>
            <div className="flex flex-col gap-1.5">
              {section.rows.map((r) => (
                <div key={r.client} className="rounded-[10px] border border-line bg-surface px-2.5 py-2">
                  <div className="text-[14px] font-bold leading-tight text-ink">{r.client}</div>
                  <div className="mt-0.5 text-[13px] leading-tight text-ink-2">{r.filing}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-2">
                    <span
                      className="pill"
                      style={{ background: STAGE_STYLE[r.stagePill].bg, color: STAGE_STYLE[r.stagePill].fg }}
                    >
                      {r.stage}
                    </span>
                    <span className="tnum font-bold" style={{ color: WHEN_COLOR[r.stagePill] }}>
                      {r.when}
                    </span>
                    {r.stake ? (
                      <span className="tnum ml-auto font-bold text-ink">{r.stake}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TONE_COLOR: Record<"danger" | "warn" | "ok", string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ok: "var(--ok)",
};

function MiniStat({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE_COLOR }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-2">{label}</div>
      <div className="tnum text-[18px] font-extrabold leading-tight" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- showcase */

const LADDER: Array<{ stage: string; pill: StagePill; when: string; text: string }> = [
  {
    stage: "T-10",
    pill: "st-calm",
    when: "10 days before",
    text: "We are preparing your GSTR-3B (summary return and tax payment) for Aug 2026, due on 20 Sep 2026. Please share the following when convenient …",
  },
  {
    stage: "T-5",
    pill: "st-calm",
    when: "5 days before",
    text: "A reminder that GSTR-3B for Aug 2026 is due on 20 Sep 2026 and we are still waiting on … Sharing these in the next day or two gives us time to review before filing.",
  },
  {
    stage: "T-2",
    pill: "st-warn",
    when: "2 days before",
    text: "GSTR-3B is due in 2 days (20 Sep 2026). The following are still pending … Without these we will not be able to file on time.",
  },
  {
    stage: "T-1",
    pill: "st-warn",
    when: "1 day before",
    text: "Final reminder. GSTR-3B is due tomorrow (20 Sep 2026). Still pending … If we miss the date: late fee plus 18% p.a. interest on unpaid tax.",
  },
  {
    stage: "Overdue",
    pill: "st-danger",
    when: "Past due",
    text: "GSTR-3B was due on 20 Sep 2026 and remains unfiled because we have not received … Late fee plus 18% p.a. interest on unpaid tax. Please treat this as urgent.",
  },
];

// Only T-10, T-2 and Overdue render in the transcript card — the full
// five-stage sequence (including T-5 and T-1) is preserved for a non-visual
// reader in the <p className="sr-only"> below. Hoisted to module scope since
// LADDER is constant and Showcase has no props/state to vary it by.
const TRANSCRIPT_STAGES = ["T-10", "T-2", "Overdue"];
const TRANSCRIPT = LADDER.filter((step) => TRANSCRIPT_STAGES.includes(step.stage));

function Showcase() {
  return (
    <section id="ladder" className="border-t border-line bg-surface-2/60 scroll-mt-4">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">
          Escalation, not reminders
        </p>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight text-ink md:text-[26px]">
          Every filing runs the same five stages
        </h2>
        <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
          Tone escalates as the date approaches. The last two messages name the penalty.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div
            className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-2 p-4"
            aria-hidden="true"
          >
            {TRANSCRIPT.map((step) => (
              <div key={step.stage} className="rounded-xl border border-line bg-surface p-2.5">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[11px] font-extrabold tracking-[0.02em]"
                  style={{ color: STAGE_STYLE[step.pill].fg, background: STAGE_STYLE[step.pill].bg }}
                >
                  {step.stage}
                </span>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.text}</p>
              </div>
            ))}
          </div>
          <p className="sr-only">
            Full five-stage sequence: T-10 opening request, T-5 reminder, T-2 pending-items notice,
            T-1 final reminder naming the penalty, and an overdue notice repeating the penalty and
            marking the case urgent.
          </p>

          <div className="flex flex-col gap-4">
            <Benefit
              n="1"
              title="Tone escalates on its own"
              body="T-10 to overdue, five stages, no manual follow-up — the last two name the late fee."
            />
            <Benefit
              n="2"
              title="Reminders don't rank risk"
              body="Chased by what missing it costs, not just the date — the ₹1.9L filing gets chased harder than the ₹4.2k one."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefit({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <span
        className="mb-2 grid h-7 w-7 place-items-center rounded-lg text-[13px] font-extrabold"
        style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        aria-hidden="true"
      >
        {n}
      </span>
      <h3 className="text-[15px] font-bold text-ink">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------- closing */

function ClosingCta() {
  return (
    <section className="border-t border-line bg-surface-2/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-14 md:px-6 md:py-20">
        <h2 className="text-[24px] font-bold tracking-tight text-ink md:text-[30px]">
          See it on your own filings.
        </h2>
        <p className="max-w-[55ch] text-[15px] leading-relaxed text-ink-2">
          Open the live demo and look at a real, seeded practice — overdue filings, chase history, penalty
          exposure, all of it.
        </p>
        <Link href="/board" className="btn btn-primary px-5 py-2.5 text-[14px]">
          Open the live demo
        </Link>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- footer */

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-8 text-[12px] text-ink-3 md:px-6">
        <span>Vahi — compliance command centre for CA practices.</span>
        <span>Demo data is fictional. Built to show a working deadline engine and chase logic, not a finished product.</span>
      </div>
    </footer>
  );
}
