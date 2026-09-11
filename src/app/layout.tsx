import type { Metadata, Viewport } from "next";
import "./globals.css";
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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
