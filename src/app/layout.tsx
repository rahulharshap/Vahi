import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { firm } from "@/lib/store";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  seedIfEmpty();
  const f = firm();
  return (
    <html lang="en">
      <body>
        <Nav firmName={f.name} city={f.city} />
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-6 md:pb-12">{children}</main>
      </body>
    </html>
  );
}
