import Link from "next/link";
import { currentFirmId, getFirm, getSettings, listApiKeys } from "@/lib/tenant";
import { INTAKE_DOMAIN } from "@/lib/intake";
import { SectionHead, prettyDate } from "@/components/ui";
import { createApiKeyAction, inviteMemberAction, revokeApiKeyAction, revokeInviteAction, saveFirmAction } from "@/app/actions";
import { authConfigured, membershipsOf, openInvitations, seatUsage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; seats?: string }>;
}) {
  const { created, seats: seatError } = await searchParams;
  const firmId = await currentFirmId();
  const firm = await getFirm(firmId);
  const s = await getSettings(firmId);
  const keys = await listApiKeys(firmId);
  const members = authConfigured() ? await membershipsOf(firmId) : [];
  const invites = authConfigured() ? await openInvitations(firmId) : [];
  const seats = await seatUsage(firmId);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">Settings</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">
          How Vahi speaks on your firm&rsquo;s behalf. Statutory dates are not configurable here — those are the
          same for every firm in India, and are covered by the rules engine.
        </p>
      </header>

      {created ? (
        <section
          className="rounded-xl border p-4"
          style={{ background: "var(--warn-soft)", borderColor: "var(--warn)" }}
        >
          <div className="text-[13px] font-bold" style={{ color: "var(--warn)" }}>
            Copy this key now — it is not stored and cannot be shown again
          </div>
          <code className="scroll-x mt-2 block rounded-lg bg-[color:var(--surface)] px-3 py-2 font-mono text-[12.5px] text-ink">
            {created}
          </code>
          <Link href="/settings" className="btn mt-3">
            I have copied it
          </Link>
        </section>
      ) : null}

      <form action={saveFirmAction} className="space-y-5">
        <fieldset className="card space-y-4 p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Your firm
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Firm name" name="name" value={firm?.name ?? ""} placeholder="Rao & Associates" />
            <Field label="City" name="city" value={firm?.city ?? ""} placeholder="Hyderabad" />
          </div>
          <p className="text-[11.5px] text-ink-3">
            This name signs every chase message. Clients see it, so use the name they know you by.
          </p>
        </fieldset>

        <fieldset className="card space-y-4 p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Sending
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="WhatsApp business number"
              name="wa_business_number"
              value={s.wa_business_number ?? ""}
              placeholder="+919848012345"
              mono
              hint="The number chases are sent from"
            />
            <Field
              label="Reply-to email"
              name="reply_to_email"
              value={s.reply_to_email ?? ""}
              placeholder="compliance@yourfirm.in"
              hint="Where client replies land if they ignore the intake address"
            />
            <Field
              label="Sender name"
              name="sender_name"
              value={s.sender_name ?? ""}
              placeholder="Rao & Associates"
              hint="Display name on outgoing email"
            />
            <div>
              <label className="label" htmlFor="default_channel">
                Default channel for new clients
              </label>
              <select id="default_channel" name="default_channel" defaultValue={s.default_channel} className="field">
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="card space-y-4 p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Providers
          </legend>
          <p className="text-[12.5px] leading-snug text-ink-3">
            Vahi stores the <em>name</em> of the environment variable holding each credential, never the
            credential. A token in a database row is a token in every backup.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp provider" name="wa_provider" value={s.wa_provider ?? ""} placeholder="aisensy" />
            <Field
              label="WhatsApp credential env var"
              name="wa_credential_ref"
              value={s.wa_credential_ref ?? ""}
              placeholder="WA_API_KEY"
              mono
            />
            <Field label="Email provider" name="email_provider" value={s.email_provider ?? ""} placeholder="postmark" />
            <Field
              label="Email credential env var"
              name="email_credential_ref"
              value={s.email_credential_ref ?? ""}
              placeholder="EMAIL_API_KEY"
              mono
            />
          </div>
        </fieldset>

        <fieldset className="card space-y-4 p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Receiving documents
          </legend>
          <Field
            label="Intake domain"
            name="intake_domain"
            value={s.intake_domain ?? ""}
            placeholder={INTAKE_DOMAIN}
            mono
            hint="Subdomain carrying the MX record. Chase emails reply here."
          />
          <div className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11.5px] text-ink-3">
            docs+&lt;filing token&gt;@{s.intake_domain || INTAKE_DOMAIN}
          </div>
        </fieldset>

        <fieldset className="card space-y-4 p-4">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Chasing
          </legend>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
            <input
              type="checkbox"
              name="chase_enabled"
              defaultChecked={!!s.chase_enabled}
              className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]"
            />
            <span>
              <span className="block text-[13px] font-semibold text-ink">Send chases automatically</span>
              <span className="block text-[11.5px] leading-snug text-ink-3">
                Off means messages are still composed and queued, but nothing leaves without a click.
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Send at (hour, 24h)"
              name="chase_send_hour"
              value={String(s.chase_send_hour)}
              type="number"
              hint="Local to your firm's timezone"
            />
            <Field
              label="Stop chasing after (days overdue)"
              name="chase_lookback_days"
              value={String(s.chase_lookback_days)}
              type="number"
              hint="Older than this is a phone call, not a template"
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" type="submit">
            Save settings
          </button>
          <Link href="/settings/templates" className="btn">
            Edit message templates →
          </Link>
        </div>
      </form>

      <section className="card p-4">
        <SectionHead
          title="Your team"
          count={members.length}
          action={
            <span className="tnum text-[11px] text-ink-3">
              {seats.limit === null
                ? "no seat limit"
                : seats.used + " of " + seats.limit + " seats used"}
            </span>
          }
        />
        {seatError ? (
          <p
            role="alert"
            className="mb-3 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            {seatError}
          </p>
        ) : null}
        {!authConfigured() ? (
          <p
            className="rounded-lg px-3 py-2 text-[12.5px] leading-snug"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            Sign-in is not configured on this deployment, so anyone with the link has full access. Set
            NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to turn authentication on.
          </p>
        ) : (
          <>
            {members.length ? (
              <ul className="mb-3 divide-y divide-[color:var(--border)]">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">
                        {m.full_name || "Unnamed member"}
                      </div>
                      <div className="font-mono text-[11px] text-ink-3">{m.user_id.slice(0, 8)}…</div>
                    </div>
                    <span className="pill" style={{ background: "var(--brand-soft)", color: "var(--brand-ink)" }}>
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {invites.length ? (
              <ul className="mb-3 divide-y divide-[color:var(--border)]">
                {invites.map((i) => {
                  const revoke = revokeInviteAction.bind(null, i.id);
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink-2">{i.email}</div>
                        <div className="text-[11px] text-ink-3">invited as {i.role} · not yet joined</div>
                      </div>
                      <form action={revoke}>
                        <button className="btn btn-ghost text-[12px]" type="submit">
                          Cancel
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <form action={inviteMemberAction} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <label className="label" htmlFor="inviteEmail">
                  Invite a colleague
                </label>
                <input id="inviteEmail" name="inviteEmail" type="email" placeholder="kiran@yourfirm.in" className="field" />
              </div>
              <div>
                <label className="label" htmlFor="inviteRole">
                  Role
                </label>
                <select id="inviteRole" name="inviteRole" defaultValue="staff" className="field">
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <button className="btn" type="submit" disabled={seats.free === 0}>
                Invite
              </button>
            </form>
            <p className="mt-2 text-[11px] leading-snug text-ink-3">
              They create an account with that email and are attached to this firm automatically. Vahi does not
              send the invitation email yet — tell them yourself.
            </p>
          </>
        )}
      </section>

      <section className="card p-4">
        <SectionHead
          title="API keys"
          count={keys.filter((k) => !k.revoked_at).length}
          action={<span className="text-[11px] text-ink-3">for integrations and testing</span>}
        />
        <p className="mb-3 text-[12.5px] leading-snug text-ink-3">
          Keys are stored hashed. The full key is shown once at creation and never again.
        </p>

        {keys.length ? (
          <ul className="mb-4 divide-y divide-[color:var(--border)]">
            {keys.map((k) => {
              const revoke = revokeApiKeyAction.bind(null, k.id);
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{k.name}</div>
                    <div className="font-mono text-[11.5px] text-ink-3">
                      {k.key_prefix}… · {k.scopes} · created {prettyDate(k.created_at)}
                      {k.last_used_at ? " · last used " + prettyDate(k.last_used_at) : " · never used"}
                    </div>
                  </div>
                  {k.revoked_at ? (
                    <span className="pill" style={{ background: "var(--calm-soft)", color: "var(--text-3)" }}>
                      Revoked
                    </span>
                  ) : (
                    <form action={revoke}>
                      <button className="btn btn-ghost text-[12px]" type="submit">
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <form action={createApiKeyAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="label" htmlFor="keyName">
              New key name
            </label>
            <input id="keyName" name="keyName" placeholder="Integration tests" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="scopes">
              Access
            </label>
            <select id="scopes" name="scopes" defaultValue="read" className="field">
              <option value="read">Read only</option>
              <option value="write">Read and write</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn" type="submit">
            Create key
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  placeholder,
  hint,
  mono,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        className={"field" + (mono ? " font-mono" : "")}
      />
      {hint ? <p className="mt-1 text-[11px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}
