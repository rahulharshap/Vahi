"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Search that lives in the URL.
 *
 * Filtering happens in SQL, not in the browser, because a real firm has
 * hundreds of clients and thousands of filings — sending them all down to
 * filter client-side would undo the work done on page weight. Keeping the
 * term in the query string also makes a filtered view shareable and
 * survivable across a refresh.
 */
export default function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep in step when navigation changes the URL from elsewhere
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  const push = (next: string) => {
    const p = new URLSearchParams(params.toString());
    if (next.trim()) p.set("q", next.trim());
    else p.delete("q");
    const qs = p.toString();
    router.replace(qs ? pathname + "?" + qs : pathname, { scroll: false });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), 250);
  };

  return (
    <div className="relative w-full sm:max-w-xs">
      <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer.current) clearTimeout(timer.current);
            push(value);
          }
          if (e.key === "Escape") {
            setValue("");
            push("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field pl-8"
      />
      {value ? (
        <button
          onClick={() => {
            setValue("");
            push("");
          }}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[15px] leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
