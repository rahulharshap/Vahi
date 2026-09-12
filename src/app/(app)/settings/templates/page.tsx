import Link from "next/link";
import { currentFirmId } from "@/lib/tenant";
import { listTemplates, previewTemplate, STAGES } from "@/lib/messages";
import { TEMPLATE_VARIABLES, unknownVariables } from "@/lib/templates";
import { STAGE_LABEL } from "@/lib/whatsapp";
import { SectionHead } from "@/components/ui";
import { resetTemplateAction, saveTemplateAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const CHANNELS = [
  { key: "WHATSAPP" as const, label: "WhatsApp" },
  { key: "EMAIL" as const, label: "Email" },
];

export default async function Templates({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const sp = await searchParams;
  const channel = sp.channel === "EMAIL" ? "EMAIL" : "WHATSAPP";
  const firmId = await currentFirmId();
  const all = await listTemplates(firmId);
  const templates = all.filter((t) => t.channel === channel);

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <Link href="/settings" className="text-[12px] font-semibold text-ink-3 hover:text-ink">
          ← Settings
        </Link>
        <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          Message templates
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">
          The wording of each chase, per channel and escalation stage. What gets substituted in — which
          documents are outstanding, the due date, the statutory penalty — comes from the rules engine, so you
          can change how a message reads but not what it claims.
        </p>
      </header>

      <div className="flex gap-1.5">
        {CHANNELS.map((c) => (
          <Link
            key={c.key}
            href={"/settings/templates?channel=" + c.key}
            className={
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors " +
              (channel === c.key ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3")
            }
          >
            {c.label}
          </Link>
        ))}
      </div>

      <section className="card p-4">
        <SectionHead title="Available variables" />
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {TEMPLATE_VARIABLES.map((v) => (
            <div key={v.name} className="flex gap-2 text-[12px]">
              <code className="shrink-0 font-mono text-brand">{"{{" + v.name + "}}"}</code>
              <span className="text-ink-3">{v.describes}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        {STAGES.map((stage) => {
          const t = templates.find((x) => x.stage === stage)!;
          const save = saveTemplateAction.bind(null, channel, stage);
          const reset = resetTemplateAction.bind(null, channel, stage);
          const preview = previewTemplate({ subject: t.subject, body: t.body }, channel);
          const unknown = unknownVariables(t.body + " " + (t.subject ?? ""));

          return (
            <section key={stage} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <h2 className="text-[13px] font-bold text-ink">{STAGE_LABEL[stage]}</h2>
                {t.customised ? (
                  <span className="pill" style={{ background: "var(--brand-soft)", color: "var(--brand-ink)" }}>
                    Customised
                  </span>
                ) : (
                  <span className="pill" style={{ background: "var(--calm-soft)", color: "var(--text-3)" }}>
                    Default
                  </span>
                )}
                {t.customised ? (
                  <form action={reset} className="ml-auto">
                    <button className="btn btn-ghost text-[12px]" type="submit">
                      Reset to default
                    </button>
                  </form>
                ) : null}
              </div>

              <form action={save} className="space-y-3 p-4">
                {channel === "EMAIL" ? (
                  <div>
                    <label className="label" htmlFor={stage + "-subject"}>
                      Subject
                    </label>
                    <input
                      id={stage + "-subject"}
                      name="subject"
                      defaultValue={t.subject ?? ""}
                      className="field"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="label" htmlFor={stage + "-body"}>
                    Message
                  </label>
                  <textarea
                    id={stage + "-body"}
                    name="body"
                    defaultValue={t.body}
                    rows={12}
                    className="field resize-y font-mono text-[12.5px]"
                  />
                  <p className="mt-1 text-[11px] text-ink-3">
                    Saving an empty message restores the default.
                  </p>
                </div>

                {unknown.length ? (
                  <p
                    className="rounded-lg px-3 py-2 text-[12px]"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                  >
                    Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => "{{" + u + "}}").join(", ")}
                    {" — these will be sent literally."}
                  </p>
                ) : null}

                <details className="rounded-lg border border-line bg-surface-2 p-3">
                  <summary className="cursor-pointer text-[12px] font-semibold text-ink-2">
                    Preview with sample data
                  </summary>
                  {preview.subject ? (
                    <div className="mt-2 text-[12px] font-semibold text-ink">Subject: {preview.subject}</div>
                  ) : null}
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">
                    {preview.body}
                  </pre>
                </details>

                <button className="btn btn-primary" type="submit">
                  Save {STAGE_LABEL[stage].toLowerCase()}
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
