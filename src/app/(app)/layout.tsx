import Link from "next/link";
import { Sidebar, TopBar, BottomTabs } from "@/components/Nav";
import DemoBanner from "@/components/DemoBanner";
import { firmSafe } from "@/lib/store";
import { authConfigured, currentUser } from "@/lib/auth";
import { isGuest } from "@/lib/guest";
import GuestReadOnly from "@/components/GuestReadOnly";
import { signOutAction } from "@/app/auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = authConfigured() ? await currentUser() : null;

  // Signed in, but attached to no firm. Middleware let them through because
  // they are authenticated; there is simply nothing for them to see, and
  // saying so plainly beats an empty board that looks broken.
  if (user && !user.membership) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="card space-y-3 p-5">
          <h1 className="text-[16px] font-bold text-ink">You are not a member of any firm</h1>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Signed in as {user.email}. Ask your firm&rsquo;s owner to invite this address from their Settings
            page, then sign in again.
          </p>
          <form action={signOutAction}>
            <button className="btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const guest = await isGuest();
  const f = await firmSafe();
  // set NEXT_PUBLIC_DEMO_MODE=false once this holds a real firm's data
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        firmName={f.name}
        city={f.city}
        userEmail={user?.email ?? null}
        userName={user?.membership?.full_name ?? null}
        role={user?.membership?.role ?? null}
        platformAdmin={user?.platformAdmin ?? false}
      />
      <div className="min-w-0 flex-1">
        <TopBar firmName={f.name} city={f.city} />
        {guest ? (
          <div
            className="border-b px-4 py-2 text-center text-[12.5px] font-semibold md:px-6"
            style={{ background: "var(--brand-soft)", borderColor: "var(--brand)", color: "var(--brand-ink)" }}
          >
            You are viewing a read-only demo — nothing you do here is saved.{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>{" "}
            to make changes.
          </div>
        ) : null}
        {demo ? <DemoBanner /> : null}
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:px-6 lg:pb-12 lg:pt-6">{children}</main>
        {guest ? <GuestReadOnly /> : null}
      </div>
      <BottomTabs />
    </div>
  );
}
