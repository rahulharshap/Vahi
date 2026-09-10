"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Board", icon: BoardIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/chases", label: "Chases", icon: ChatIcon },
  { href: "/clients", label: "Clients", icon: PeopleIcon },
];

export default function Nav({ firmName, city }: { firmName: string; city: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-[color:var(--surface)]/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-ink">Vahi</span>
              <span className="hidden text-[11px] text-ink-3 sm:block">
                {firmName} · {city}
              </span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={
                    "rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors " +
                    (active
                      ? "bg-brand-soft text-brand-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                  }
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <Link href="/clients/new" className="btn btn-primary ml-auto md:ml-2">
            <span className="text-base leading-none">+</span>
            <span className="hidden sm:inline">Client</span>
          </Link>
        </div>
      </header>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color:var(--surface)]/95 backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors " +
                  (active ? "text-brand" : "text-ink-3")
                }
              >
                <Icon active={active} />
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </>
  );
}

function Mark() {
  return (
    <span
      aria-hidden
      className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand text-[15px] font-black text-white"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      व
    </span>
  );
}

type IconProps = { active?: boolean };
const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function BoardIcon(_: IconProps) {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function CalendarIcon(_: IconProps) {
  return (
    <svg {...S}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function ChatIcon(_: IconProps) {
  return (
    <svg {...S}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z" />
    </svg>
  );
}
function PeopleIcon(_: IconProps) {
  return (
    <svg {...S}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0M16.5 5.2a3.2 3.2 0 0 1 0 5.9M18 20a5.6 5.6 0 0 0-2.2-4.4" />
    </svg>
  );
}
