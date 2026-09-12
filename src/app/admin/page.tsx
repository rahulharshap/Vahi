import Link from "next/link";
import { authConfigured, currentUser } from "@/lib/auth";
import { firmSummaries } from "@/lib/tenant";
import { SectionHead } from "@/components/ui";
import { createFirmAction, inviteOwnerAction, setSeatsAction, toggleFirmActiveAction } from "@/app/admin-actions";
import { signOutAction } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

/**
 * The platform console.
 *
 * A different audience from the rest of the app: this is for whoever operates
 * Vahi, not for a CA firm. It creates tenants and sets their limits, and it
 * never creates a user account — owners are invited and sign up themselves, so
 * no password is minted by one person and handed to another.
 */
export default async function Admin({ searchParams }: { searchParams: Promise<{ seats?: string }> }) {
  const { seats: seatError } = await searchParams;
  const user = authConfigured() ? await currentUser() : null;

  if (!authConfigured()) {
    return (
      <Shell>
        <div className="card space-y-2 p-5">
          <h1 className="text-[16px] font-bold text-ink">Sign-in is not configured</h1>
          <p className="text-[13px] leading-relaxed text-ink-2">
            The platform console identifies operators by their signed-in email, so it needs authentication.
            Set <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then list your address
            in <code className="font-mono text-[12px]">PLATFORM_ADMIN_EMAILS</code>.
          </p>
        </div>
      </Shell>
    );
  }

  if (!user?.platformAdmin) {
    return (
      <Shell>
        <div className="card space-y-3 p-5">
          <h1 className="text-[16px] font-bold text-ink">Not permitted</h1>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {user
              ? "Signed in as " + user.email + ", which is not a platform administrator."
              : "You are not signed in."}{" "}
            Operating Vahi is separate from owning a firm on it — add the address to{" "}
            <code className="font-mono text-[12px]">PLATFORM_ADMIN_EMAILS</code> to grant it.
          </p>
          <div className="flex gap-2">
            <Link href="/board" className="btn">
              Back to the app
            </Link>
            {user ? (
              <form action={signOutAction}>
                <button className="btn btn-ghost" type="submit">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </Shell>
    );
  }

  const firms = await firmSummaries();
  const totals = firms.reduce(
    (a, f) => ({
      members: a.members + Number(f.members),
      clients: a.clients + Number(f.clients),
      filings: a.filings + Number(f.filings),
    }),
    { members: 0, clients: 0, filings: 0 },
  );

  return (
    <Shell email={user.email}>
      <header className="mb-5">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          Platform console
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {firms.length} {firms.length === 1 ? "firm" : "firms"} · {totals.members} people ·{" "}
          {totals.clients.toLocaleString("en-IN")} clients · {totals.filings.toLocaleString("en-IN")} filings
        </p>
      </header>

      <section className="card mb-5 p-4">
        <SectionHead title="Create a firm" />
        <p className="mb-3 text-[12.5px] leading-snug text-ink-3">
          Creating a firm does not create an account. The owner is invited by email and signs up themselves — so
          no password passes through your hands, and they verify their own address.
        </p>
        <form action={createFirmAction} className="grid gap-3 sm:grid-cols-2">
          <Field label="Firm name" name="name" placeholder="Rao & Associates" required />
          <Field label="City" name="city" placeholder="Hyderabad" required />
          <Field label="Owner's email" name="ownerEmail" type="email" placeholder="owner@theirfirm.in" />
          <Field label="Seat limit" name="maxMembers" type="number" placeholder="Leave blank for unlimited" />
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">
              Create firm and invite owner
            </button>
          </div>
        </form>
      </section>

      {seatError ? (
        <p
          role="alert"
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {seatError}
        </p>
      ) : null}

      <SectionHead title="Firms" count={firms.length} />
      <div className="space-y-3">
        {firms.map((f) => {
          const used = Number(f.members) + Number(f.invites);
          const limit = f.maxMembers;
          const full = limit !== null && used >= limit;
          const seats = setSeatsAction.bind(null, f.id);
          const invite = inviteOwnerAction.bind(null, f.id);
          const toggle = toggleFirmActiveAction.bind(null, f.id, !f.active);

          return (
            <article key={f.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14px] font-bold text-ink">{f.name}</h2>
                    <code className="font-mono text-[10.5px] text-ink-3">{f.slug}</code>
                    {!f.active ? (
                      <span className="pill" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                        Suspended
                      </span>
                    ) : null}
                    {full ? (
                      <span className="pill" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                        Seats full
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {f.city} · {f.timezone}
                  </p>
                </div>
                <form action={toggle}>
                  <button className="btn btn-ghost text-[12px]" type="submit">
                    {f.active ? "Suspend" : "Reactivate"}
                  </button>
                </form>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="People" value={String(f.members)} />
                <Stat label="Pending invites" value={String(f.invites)} />
                <Stat label="Clients" value={Number(f.clients).toLocaleString("en-IN")} />
                <Stat label="Filings" value={Number(f.filings).toLocaleString("en-IN")} />
              </dl>

              <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                <form action={seats} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="label" htmlFor={f.id + "-seats"}>
                      Seat limit — {limit === null ? "unlimited" : used + " of " + limit + " used"}
                    </label>
                    <input
                      id={f.id + "-seats"}
                      name="maxMembers"
                      type="number"
                      min={1}
                      defaultValue={limit ?? ""}
                      placeholder="Unlimited"
                      className="field tnum"
                    />
                  </div>
                  <button className="btn" type="submit">
                    Set
                  </button>
                </form>

                <form action={invite} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="label" htmlFor={f.id + "-invite"}>
                      Invite a person
                    </label>
                    <input
                      id={f.id + "-invite"}
                      name="ownerEmail"
                      type="email"
                      placeholder="owner@theirfirm.in"
                      className="field"
                    />
                  </div>
                  <select name="role" defaultValue="owner" className="field w-auto" aria-label="Role">
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                  <button className="btn" type="submit" disabled={full}>
                    Invite
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children, email }: { children: React.ReactNode; email?: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-[9px] text-[15px] font-black text-white"
          style={{ background: "var(--accent)" }}
        >
          व
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-bold tracking-tight text-ink">Vahi operations</div>
          <div className="truncate text-[11px] text-ink-3">{email ?? "platform console"}</div>
        </div>
        <Link href="/board" className="btn btn-ghost ml-auto text-[12px]">
          App →
        </Link>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">{label}</dt>
      <dd className="tnum text-[16px] font-bold text-ink">{value}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} placeholder={placeholder} required={required} className="field" />
    </div>
  );
}
