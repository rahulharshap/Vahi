"use client";

import { useActionState, useState } from "react";
import { signInAction, signUpAction, type AuthResult } from "@/app/auth-actions";

const EMPTY: AuthResult = {};

export default function LoginForm({ next, initialMode }: { next: string; initialMode: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [signInState, signIn, signingIn] = useActionState(signInAction, EMPTY);
  const [signUpState, signUp, signingUp] = useActionState(signUpAction, EMPTY);

  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signingIn : signingUp;

  return (
    <div className="card p-5">
      <div className="mb-4 flex gap-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={
              "flex-1 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-colors " +
              (mode === m ? "bg-brand-soft text-brand-ink" : "text-ink-3 hover:bg-surface-2")
            }
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form action={mode === "signin" ? signIn : signUp} className="space-y-3">
        <input type="hidden" name="next" value={next} />

        {mode === "signup" ? (
          <div>
            <label className="label" htmlFor="fullName">
              Your name
            </label>
            <input id="fullName" name="fullName" placeholder="Sunitha Rao" className="field" autoComplete="name" />
            <p className="mt-1 text-[11px] text-ink-3">Shown on the filings you own.</p>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@yourfirm.in"
            className="field"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="field"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
          />
          {mode === "signup" ? (
            <p className="mt-1 text-[11px] text-ink-3">At least 8 characters.</p>
          ) : null}
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            {state.error}
          </p>
        ) : null}

        {state.notice ? (
          <p
            className="rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
          >
            {state.notice}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-[11.5px] leading-snug text-ink-3">
        {mode === "signin"
          ? "Your firm's owner can invite you from Settings. Without an invitation there is nothing to see."
          : "The first account created on a new deployment becomes the firm's owner. After that, joining needs an invitation."}
      </p>
    </div>
  );
}
