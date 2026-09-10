import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar, TopBar, BottomTabs } from "@/components/Nav";
import DemoBanner from "@/components/DemoBanner";
import { firmSafe } from "@/lib/store";
import { driver } from "@/lib/db";
import { seedIfEmpty } from "@/lib/seed";

export const metadata: Metadata = {
  title: "Vahi — compliance command centre",
  description: "Deadline tracking and automated document chasing for CA practices.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // local SQLite builds and seeds itself; Postgres is seeded by POST /api/seed
  if (driver === "sqlite") {
    try {
      await seedIfEmpty();
    } catch {
      // a broken local database must not take the whole app down
    }
  }
  const f = await firmSafe();
  // set NEXT_PUBLIC_DEMO_MODE=false once this holds a real firm's data
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-dvh">
          <Sidebar firmName={f.name} city={f.city} />
          <div className="min-w-0 flex-1">
            <TopBar firmName={f.name} city={f.city} />
            {demo ? <DemoBanner /> : null}
            <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:px-6 lg:pb-12 lg:pt-6">{children}</main>
          </div>
        </div>
        <BottomTabs />
      </body>
    </html>
  );
}
