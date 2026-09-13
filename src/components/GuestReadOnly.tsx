"use client";

import { useEffect } from "react";

/**
 * Make write controls visibly inert for a guest.
 *
 * The real guard is assertWritable() in every mutating server action, and it
 * stays there — a server action is an endpoint, so anything enforced only in
 * the browser is decoration. This is purely about what a visitor experiences:
 * without it, clicking Filed throws a server exception and the page turns into
 * "Application error: a server-side exception has occurred", which reads as a
 * broken product rather than a deliberate limit.
 *
 * Runs on mount and again whenever the DOM changes, because navigation within
 * the app swaps content without remounting this component.
 */
export default function GuestReadOnly() {
  useEffect(() => {
    const NOTE = "Read-only demo — sign in to make changes";

    const disable = () => {
      const main = document.querySelector("main");
      if (!main) return;
      for (const el of main.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "form button, form input, form select, form textarea",
      )) {
        // the search box is a read operation and stays usable
        if (el.closest("[data-guest-allow]")) continue;
        if (!el.disabled) {
          el.disabled = true;
          el.title = NOTE;
          el.style.cursor = "not-allowed";
        }
      }
    };

    disable();
    const observer = new MutationObserver(disable);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
