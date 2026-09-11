import { Sidebar, TopBar, BottomTabs } from "@/components/Nav";
import DemoBanner from "@/components/DemoBanner";
import { firmSafe } from "@/lib/store";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const f = await firmSafe();
  // set NEXT_PUBLIC_DEMO_MODE=false once this holds a real firm's data
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  return (
    <div className="flex min-h-dvh">
      <Sidebar firmName={f.name} city={f.city} />
      <div className="min-w-0 flex-1">
        <TopBar firmName={f.name} city={f.city} />
        {demo ? <DemoBanner /> : null}
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:px-6 lg:pb-12 lg:pt-6">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}
