"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { joinFirm, supabaseServer } from "@/lib/auth";
import { audit, logger } from "@/lib/log";
import { runAsFirm } from "@/lib/tenant";

/**
 * Sign in, sign up, sign out.
 *
 * Errors come back as a message on the form rather than a thrown exception,
 * and they are deliberately vague about which half was wrong: "that email and
 * password do not match" tells an attacker nothing about whether the account
 * exists.
 */

export interface AuthResult {
  error?: string;
  notice?: string;
}

export async function signInAction(_prev: AuthResult, fd: FormData): Promise<AuthResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/board");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    logger.warn("auth.signin_failed", { email });
    return { error: "That email and password do not match." };
  }

  await joinFirm(data.user.id, email);
  logger.info("auth.signin", { userId: data.user.id });
  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/board");
}

export async function signUpAction(_prev: AuthResult, fd: FormData): Promise<AuthResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const fullName = String(fd.get("fullName") ?? "").trim();
  if (!email || !password) return { error: "Enter your email and a password." };
  if (password.length < 8) return { error: "Use at least 8 characters." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) {
    logger.warn("auth.signup_failed", { email, message: error.message });
    return { error: error.message };
  }

  // With email confirmation switched on there is no session yet, and the
  // membership is created on first sign-in instead.
  if (data.user && data.session) {
    const membership = await joinFirm(data.user.id, email, fullName || undefined);
    if (membership) {
      await runAsFirm({ firmId: membership.firm_id, actor: data.user.id, actorKind: "USER" }, () =>
        audit({ action: "member.joined", entity: "membership", entityId: membership.id, detail: { email, role: membership.role } }),
      );
    }
    revalidatePath("/", "layout");
    redirect("/board");
  }

  return { notice: "Check your email to confirm the address, then sign in." };
}

export async function signOutAction() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
