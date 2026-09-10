"use client";

import { useEffect, useState } from "react";

const KEY = "vahi.demoBanner.v1";

/**
 * First-run explainer for people opening the demo link cold.
 *
 * Collapses to a single line once read, and remembers that per browser. It
 * also states plainly what is not wired up — a CA who discovers on their own
 * that WhatsApp does not send is a CA who stops trusting the rest of it.
 */
export default function DemoBanner() {
  // Open on the server so the explainer is in the initial HTML — a visitor
  // opening the demo link must see it immediately, not after hydration.
  // Returning visitors collapse it on mount.
  const [state, setState] = useState<"open" | "collapsed">("open");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      // private browsing, blocked storage — treat as first visit
    }
    if (stored === "collapsed") setState("collapsed");
  }, []);

  const remember = (next: "open" | "collapsed") => {
    setState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // nothing to do; the banner just reopens next visit
    }
  };

  if (state === "collapsed") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:px-6">
        <button
          onClick={() => remember("open")}
          className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-semibold transition-colors"
          style={{ background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          <Dot />
          Demo with sample data — tap to read what Vahi does
          <span className="ml-auto text-[15px] leading-none">+</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:px-6">
      <section
        className="overflow-hidden rounded-2xl border"
        style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}
      >
        <div className="flex items-start gap-3 px-4 pt-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[14px] font-bold" style={{ color: "var(--accent)" }}>
              <Dot />
              Demo — sample data for a fictional Hyderabad practice
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              A CA firm already knows every statutory deadline. What costs them their evenings is chasing
              hundreds of clients for documents, month after month, without straining the relationship.{" "}
              <strong className="text-ink">Vahi does the chasing.</strong>
            </p>
          </div>
          <button
            onClick={() => remember("collapsed")}
            aria-label="Collapse"
            className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-[18px] leading-none text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="grid gap-3 px-4 pb-4 pt-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Describe the client once"
            body="Entity type, GST scheme, TDS, employees, audit case. Five questions. No dates are ever typed in."
          />
          <Step
            n="2"
            title="The calendar builds itself"
            body="A rules engine turns those flags into every statutory obligation, dated. A Pvt Ltd generates 86 filings a year; a salaried individual generates one."
          />
          <Step
            n="3"
            title="Clients get chased automatically"
            body="At T-10, T-5, T-2, T-1 and past due, a message is written naming exactly which documents are missing — escalating, and citing the penalty at the end."
          />
        </div>

        <div className="border-t px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-3" style={{ borderColor: "var(--accent)" }}>
          <strong className="text-ink-2">Being honest about this build:</strong> the data is fictional, WhatsApp
          delivery is not connected yet (messages are composed and recorded, not sent), documents are ticked off by
          hand rather than auto-attached, and there is no login. The deadline engine and chase logic are real and
          working.
        </div>
      </section>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-[color:var(--surface)] p-3">
      <div className="flex items-center gap-2">
        <span
          className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-black text-white"
          style={{ background: "var(--accent)" }}
        >
          {n}
        </span>
        <span className="text-[12.5px] font-bold text-ink">{title}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{body}</p>
    </div>
  );
}
