"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth-actions";

const LINKS = [
  { href: "/board", label: "Board", hint: "What needs attention", icon: BoardIcon },
  { href: "/calendar", label: "Calendar", hint: "Every statutory date", icon: CalendarIcon },
  { href: "/chases", label: "Chases", hint: "Documents to collect", icon: ChatIcon },
  { href: "/inbox", label: "Inbox", hint: "Documents to place", icon: InboxIcon },
  { href: "/clients", label: "Clients", hint: "The roster", icon: PeopleIcon },
  { href: "/rules", label: "Rules", hint: "What Vahi tracks", icon: BookIcon },
];

const SETTINGS = { href: "/settings", label: "Settings", hint: "Templates, number, keys", icon: GearIcon };

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

/**
 * Desktop navigation. A left rail rather than a top bar: the content is
 * width-capped anyway so the horizontal space costs nothing, section labels
 * get room to breathe, and there is somewhere obvious to add Reports and
 * Settings without the header turning into a scroll.
 */
export function Sidebar({
  firmName,
  city,
  userEmail,
  userName,
  role,
  platformAdmin,
}: {
  firmName: string;
  city: string;
  userEmail?: string | null;
  userName?: string | null;
  role?: string | null;
  platformAdmin?: boolean;
}) {
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

      <div className="mt-auto px-2.5 pb-1">
        {platformAdmin ? (
          <Link
            href="/admin"
            aria-current={isActive("/admin") ? "page" : undefined}
            className={
              "mb-0.5 flex items-start gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors " +
              (isActive("/admin") ? "bg-accent-soft" : "hover:bg-surface-2")
            }
          >
            <span className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }}>
              <TowerIcon />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--accent)" }}>
                Operations
              </span>
              <span className="block text-[11px] leading-tight text-ink-3">All firms on Vahi</span>
            </span>
          </Link>
        ) : null}
        <Link
          href={SETTINGS.href}
          aria-current={isActive(SETTINGS.href) ? "page" : undefined}
          className={
            "flex items-start gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors " +
            (isActive(SETTINGS.href) ? "bg-brand-soft" : "hover:bg-surface-2")
          }
        >
          <span className="mt-0.5 shrink-0" style={{ color: isActive(SETTINGS.href) ? "var(--brand)" : "var(--text-3)" }}>
            <GearIcon />
          </span>
          <span className="min-w-0">
            <span
              className="block text-[13.5px] font-semibold leading-tight"
              style={{ color: isActive(SETTINGS.href) ? "var(--brand-ink)" : "var(--text)" }}
            >
              {SETTINGS.label}
            </span>
            <span className="block text-[11px] leading-tight text-ink-3">{SETTINGS.hint}</span>
          </span>
        </Link>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="truncate text-[12px] font-semibold text-ink-2" title={firmName}>
          {firmName}
        </div>
        <div className="text-[11px] text-ink-3">{city}</div>

        {userEmail ? (
          <div className="mt-2.5 border-t border-line pt-2.5">
            <div className="truncate text-[11.5px] font-semibold text-ink-2" title={userEmail}>
              {userName || userEmail}
            </div>
            <div className="flex items-center gap-2">
              <span className="truncate text-[10.5px] text-ink-3">{role ?? "member"}</span>
              <form action={signOutAction} className="ml-auto">
                <button type="submit" className="text-[10.5px] font-semibold text-ink-3 hover:text-ink">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : null}
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
        <Link href="/settings" aria-label="Settings" className="btn btn-ghost ml-auto px-2">
          <GearIcon />
        </Link>
        <Link href="/clients/new" className="btn btn-primary">
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
      <div className="mx-auto grid max-w-lg grid-cols-6">
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
function InboxIcon() {
  return (
    <svg {...S}>
      <path d="M3 13h4l1.5 3h7L17 13h4" />
      <path d="M4.5 5.5 3 13v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5l-1.5-7.5A1 1 0 0 0 18.5 5h-13a1 1 0 0 0-1 .5Z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg {...S}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M9 7h7M9 11h5" />
    </svg>
  );
}

function TowerIcon() {
  return (
    <svg {...S}>
      <path d="M12 3v18M8 7h8M6.5 11h11M5 15h14M7 21h10" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.4 15a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4Z" />
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
