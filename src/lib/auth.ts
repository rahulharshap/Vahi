import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { q, one, exec, uid, nowISO } from "./db";
import { logger } from "./log";

/**
 * Authentication.
 *
 * Supabase Auth owns identity — password hashing, email verification, reset
 * flows. Vahi owns authorisation: which firm a signed-in user belongs to and
 * what they may do there, in the memberships table.
 *
 * The split matters. Hand-rolling password storage is the classic way to get
 * security wrong quietly, and the parts that are genuinely ours — tenant
 * scoping, roles, the audit trail — are the parts no library can do for us.
 */

export type Role = "owner" | "admin" | "staff";

const ROLE_RANK: Record<Role, number> = { staff: 1, admin: 2, owner: 3 };

export interface Membership {
  id: string;
  user_id: string;
  firm_id: string;
  role: Role;
  full_name: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  membership: Membership | null;
  /** Operates Vahi itself — creates firms, sets their limits. */
  platformAdmin: boolean;
}

export function authConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Server-side Supabase client bound to the request's cookies.
 *
 * Writes are wrapped because Next forbids setting cookies during render; the
 * session still refreshes in middleware and in server actions, which is where
 * it matters.
 */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // called from a Server Component render; middleware handles refresh
          }
        },
      },
    },
  );
}

/** The signed-in user and their membership, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  if (!authConfigured()) return null;
  const supabase = await supabaseServer();
  // getUser() revalidates against the auth server; getSession() would trust a
  // cookie the browser could have edited
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const email = data.user.email ?? "";
  const membership = await membershipFor(data.user.id);
  return {
    id: data.user.id,
    email,
    membership,
    platformAdmin: await isPlatformAdmin(data.user.id, email),
  };
}

/**
 * Platform administrators.
 *
 * Two sources, and the env var exists to solve the bootstrap: the first
 * platform admin cannot be granted through a UI that only platform admins can
 * reach. Listing an address in PLATFORM_ADMIN_EMAILS makes whoever signs up
 * with it an operator — which is why that variable belongs in the host's
 * environment and not in the database.
 */
export async function isPlatformAdmin(userId: string, email: string): Promise<boolean> {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (email && allowed.includes(email.toLowerCase())) return true;
  const row = await one<{ user_id: string }>("SELECT user_id FROM platform_admins WHERE user_id = ?", [userId]);
  return Boolean(row);
}

export async function membershipFor(userId: string): Promise<Membership | null> {
  const row = await one<Membership>(
    "SELECT id, user_id, firm_id, role, full_name FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
    [userId],
  );
  return row ?? null;
}

export async function membershipsOf(firmId: string): Promise<Membership[]> {
  return q<Membership>(
    "SELECT id, user_id, firm_id, role, full_name FROM memberships WHERE firm_id = ? ORDER BY created_at ASC",
    [firmId],
  );
}

export function can(role: Role | undefined, required: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

// ---------------------------------------------------------------- joining

/**
 * Attach a newly signed-up user to a firm.
 *
 * Three ways in, in order:
 *   1. an open invitation for their email
 *   2. if no memberships exist at all, they claim the existing firm as owner —
 *      the bootstrap case for a fresh deployment
 *   3. otherwise nothing, and they see a "no access" screen
 *
 * Case 2 is only safe because it can happen exactly once: the moment one
 * membership exists, the door closes.
 */
export async function joinFirm(userId: string, email: string, fullName?: string): Promise<Membership | null> {
  const existing = await membershipFor(userId);
  if (existing) return existing;

  const invite = await one<{ id: string; firm_id: string; role: Role }>(
    "SELECT id, firm_id, role FROM invitations WHERE LOWER(email) = ? AND claimed_at IS NULL ORDER BY created_at ASC LIMIT 1",
    [email.toLowerCase()],
  );

  let firmId: string | null = null;
  let role: Role = "staff";

  if (invite) {
    firmId = invite.firm_id;
    role = invite.role;
  } else {
    const anyMember = await one<{ n: number | string }>("SELECT COUNT(*) AS n FROM memberships");
    if (Number(anyMember?.n ?? 0) === 0) {
      const firm = await one<{ id: string }>(
        "SELECT id FROM firms WHERE active ORDER BY created_at ASC LIMIT 1",
      );
      if (firm) {
        firmId = firm.id;
        role = "owner";
        logger.info("auth.bootstrap_owner", { userId, firmId });
      }
    }
  }

  if (!firmId) {
    logger.warn("auth.no_firm", { userId, email });
    return null;
  }

  // Checked again here because an invitation issued while a seat was free can
  // be claimed after the last one has gone. Members are counted without the
  // pending invitations, since this user is about to consume theirs.
  const limitRow = await one<{ max_members: number | null; members: number | string }>(
    `SELECT (SELECT max_members FROM firm_settings WHERE firm_id = ?) AS max_members,
            (SELECT COUNT(*) FROM memberships WHERE firm_id = ?) AS members`,
    [firmId, firmId],
  );
  const max = limitRow?.max_members ?? null;
  if (max !== null && Number(limitRow?.members ?? 0) >= max) {
    logger.warn("auth.seat_limit", { userId, firmId, max });
    return null;
  }

  const id = uid("mem");
  await exec(
    "INSERT INTO memberships (id, user_id, firm_id, role, full_name, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING",
    [id, userId, firmId, role, fullName ?? null, nowISO()],
  );
  if (invite) {
    await exec("UPDATE invitations SET claimed_at = ? WHERE id = ?", [nowISO(), invite.id]);
  }
  return membershipFor(userId);
}

/**
 * Seats used and allowed. Pending invitations count as used: a seat promised
 * to someone is not a seat you still have.
 */
export async function seatUsage(firmId: string): Promise<{ used: number; limit: number | null; free: number | null }> {
  const row = await one<{ members: number | string; invites: number | string; max_members: number | null }>(
    `SELECT
       (SELECT COUNT(*) FROM memberships WHERE firm_id = ?) AS members,
       (SELECT COUNT(*) FROM invitations WHERE firm_id = ? AND claimed_at IS NULL) AS invites,
       (SELECT max_members FROM firm_settings WHERE firm_id = ?) AS max_members`,
    [firmId, firmId, firmId],
  );
  const used = Number(row?.members ?? 0) + Number(row?.invites ?? 0);
  const limit = row?.max_members ?? null;
  return { used, limit, free: limit === null ? null : Math.max(0, limit - used) };
}

export class SeatLimitReached extends Error {
  constructor(limit: number) {
    super("This firm's plan allows " + limit + " " + (limit === 1 ? "person" : "people") + ". Remove someone, or raise the limit.");
    this.name = "SeatLimitReached";
  }
}

export async function inviteToFirm(firmId: string, email: string, role: Role, invitedBy: string) {
  const seats = await seatUsage(firmId);
  if (seats.limit !== null && seats.free === 0) throw new SeatLimitReached(seats.limit);
  await exec(
    `INSERT INTO invitations (id, firm_id, email, role, invited_by, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT DO NOTHING`,
    [uid("inv"), firmId, email.trim().toLowerCase(), role, invitedBy, nowISO()],
  );
}

export async function openInvitations(firmId: string) {
  return q<{ id: string; email: string; role: Role; created_at: string }>(
    "SELECT id, email, role, created_at FROM invitations WHERE firm_id = ? AND claimed_at IS NULL ORDER BY created_at DESC",
    [firmId],
  );
}

export async function revokeInvitation(firmId: string, id: string) {
  await exec("DELETE FROM invitations WHERE id = ? AND firm_id = ? AND claimed_at IS NULL", [id, firmId]);
}
