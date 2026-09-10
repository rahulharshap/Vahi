"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Board", hint: "What needs attention", icon: BoardIcon },
  { href: "/calendar", label: "Calendar", hint: "Every statutory date", icon: CalendarIcon },
  { href: "/chases", label: "Chases", hint: "Documents to collect", icon: ChatIcon },
  { href: "/clients", label: "Clients", hint: "The roster", icon: PeopleIcon },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/**
 * Desktop navigation. A left rail rather than a top bar: the content is
 * width-capped anyway so the horizontal space costs nothing, section labels
 * get room to breathe, and there is somewhere obvious to add Reports and
 * Settings without the header turning into a scroll.
 */
export function Sidebar({ firmName, city }: { firmName: string; city: string }) {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-[color:var(--surface)] lg:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Mark />
        <span className="text-[16px] font-bold tracking-tight text-ink">Vahi</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5">
        {LINKS.map((l) => {
          const active = isActive(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={
                "group flex items-start gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors " +
                (active ? "bg-brand-soft" : "hover:bg-surface-2")
              }
            >
              <span
                className="mt-0.5 shrink-0"
                style={{ color: active ? "var(--brand)" : "var(--text-3)" }}
              >
                <Icon />
              </span>
              <span className="min-w-0">
                <span
                  className="block text-[13.5px] font-semibold leading-tight"
                  style={{ color: active ? "var(--brand-ink)" : "var(--text)" }}
                >
                  {l.label}
                </span>
                <span className="block text-[11px] leading-tight text-ink-3">{l.hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-2.5 pt-3">
        <Link href="/clients/new" className="btn btn-primary w-full">
          <span className="text-base leading-none">+</span> Add client
        </Link>
      </div>

      <div className="mt-auto border-t border-line px-4 py-3">
        <div className="truncate text-[12px] font-semibold text-ink-2" title={firmName}>
          {firmName}
        </div>
        <div className="text-[11px] text-ink-3">{city}</div>
      </div>
    </aside>
  );
}

/** Compact header for phones and tablets, where a rail would eat the screen. */
export function TopBar({ firmName, city }: { firmName: string; city: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color:var(--surface)]/85 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight text-ink">Vahi</span>
            <span className="hidden text-[11px] text-ink-3 sm:block">
              {firmName} · {city}
            </span>
          </span>
        </Link>
        <Link href="/clients/new" className="btn btn-primary ml-auto">
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">Client</span>
        </Link>
      </div>
    </header>
  );
}

/** Thumb-reachable tabs on phones. */
export function BottomTabs() {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color:var(--surface)]/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {LINKS.map((l) => {
          const active = isActive(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors " +
                (active ? "text-brand" : "text-ink-3")
              }
            >
              <Icon />
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
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

const S = {
  width: 19,
  height: 19,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BoardIcon() {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...S}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg {...S}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg {...S}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0M16.5 5.2a3.2 3.2 0 0 1 0 5.9M18 20a5.6 5.6 0 0 0-2.2-4.4" />
    </svg>
  );
}
