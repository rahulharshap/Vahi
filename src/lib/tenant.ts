import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { q, one, exec, uid, nowISO } from "./db";

/**
 * Tenancy.
 *
 * A firm used to be a constant. It is now resolved per request — from an API
 * key on the API surface, and from configuration in the UI until there is a
 * login.
 *
 * That last part is the honest gap: the UI resolves to a single firm, so the
 * app is multi-tenant in its data model and single-tenant at the front door.
 * Everything below the door is already scoped, so adding auth means changing
 * where currentFirmId() gets its answer, not rewriting the queries.
 */

export interface Firm {
  id: string;
  name: string;
  city: string;
  slug: string | null;
  timezone: string;
  active: boolean;
}

export interface FirmSettings {
  firm_id: string;
  sender_name: string | null;
  reply_to_email: string | null;
  wa_business_number: string | null;
  wa_provider: string | null;
  email_provider: string | null;
  wa_credential_ref: string | null;
  email_credential_ref: string | null;
  intake_domain: string | null;
  chase_enabled: boolean;
  chase_send_hour: number;
  chase_lookback_days: number;
  default_channel: "WHATSAPP" | "EMAIL" | "BOTH";
}

// ------------------------------------------------------------------ current

/**
 * Per-request tenant scope.
 *
 * An API request acts for the firm its key belongs to, and every query in
 * store.ts calls currentFirmId() without knowing that. AsyncLocalStorage
 * carries the firm through the whole async call tree, so scoping an API
 * handler is one wrapper rather than a firmId parameter threaded through
 * forty functions — and a function that forgets to pass it cannot silently
 * read another tenant's rows.
 */
const scope = new AsyncLocalStorage<{ firmId: string; actor: string; actorKind: "USER" | "API" | "SYSTEM" }>();

export function runAsFirm<T>(
  ctx: { firmId: string; actor: string; actorKind: "USER" | "API" | "SYSTEM" },
  fn: () => Promise<T>,
): Promise<T> {
  return scope.run(ctx, fn);
}

/** The actor this request acts as, for the audit trail. */
export function currentActor(): { actor: string; actorKind: "USER" | "API" | "SYSTEM" } {
  const ctx = scope.getStore();
  return ctx ? { actor: ctx.actor, actorKind: ctx.actorKind } : { actor: "ui", actorKind: "USER" };
}

let cachedFirmId: string | null = null;

/**
 * The firm this request acts for.
 *
 * DEFAULT_FIRM_ID pins it explicitly; otherwise the oldest active firm is
 * used, which is correct for a single-tenant deployment and wrong the moment
 * a second firm is onboarded — which is exactly when auth has to exist.
 */
export async function currentFirmId(): Promise<string> {
  // an API request carries its firm explicitly
  const ctx = scope.getStore();
  if (ctx) return ctx.firmId;

  // a browser request takes it from the signed-in user's membership. Imported
  // lazily because this module is also used outside a request, where
  // next/headers does not exist.
  try {
    const { currentUser } = await import("./auth");
    const user = await currentUser();
    if (user?.membership) return user.membership.firm_id;
  } catch {
    // no request context, or auth is not configured
  }

  if (process.env.DEFAULT_FIRM_ID) return process.env.DEFAULT_FIRM_ID;
  if (cachedFirmId) return cachedFirmId;
  const row = await one<{ id: string }>(
    "SELECT id FROM firms WHERE active ORDER BY created_at ASC LIMIT 1",
  );
  if (!row) throw new Error("No firm exists. Run the migrations and seed, or create a firm.");
  cachedFirmId = row.id;
  return row.id;
}

/** Forget the cached firm — used after seeding replaces the roster. */
export function resetFirmCache(): void {
  cachedFirmId = null;
}

export async function getFirm(firmId: string): Promise<Firm | undefined> {
  return one<Firm>("SELECT id, name, city, slug, timezone, active FROM firms WHERE id = ?", [firmId]);
}

export async function listFirms(): Promise<Firm[]> {
  return q<Firm>("SELECT id, name, city, slug, timezone, active FROM firms ORDER BY name");
}

// ----------------------------------------------------------------- settings

const SETTINGS_COLUMNS = `firm_id, sender_name, reply_to_email, wa_business_number,
  wa_provider, email_provider, wa_credential_ref, email_credential_ref, intake_domain,
  chase_enabled, chase_send_hour, chase_lookback_days, default_channel`;

/** Settings for a firm, creating the row on first read so callers never null-check. */
export async function getSettings(firmId: string): Promise<FirmSettings> {
  const existing = await one<FirmSettings>(
    "SELECT " + SETTINGS_COLUMNS + " FROM firm_settings WHERE firm_id = ?",
    [firmId],
  );
  if (existing) return existing;
  await exec("INSERT INTO firm_settings (firm_id, updated_at) VALUES (?, ?) ON CONFLICT DO NOTHING", [
    firmId,
    nowISO(),
  ]);
  return (await one<FirmSettings>(
    "SELECT " + SETTINGS_COLUMNS + " FROM firm_settings WHERE firm_id = ?",
    [firmId],
  ))!;
}

export type SettingsInput = Partial<
  Pick<
    FirmSettings,
    | "sender_name"
    | "reply_to_email"
    | "wa_business_number"
    | "wa_provider"
    | "email_provider"
    | "wa_credential_ref"
    | "email_credential_ref"
    | "intake_domain"
    | "chase_enabled"
    | "chase_send_hour"
    | "chase_lookback_days"
    | "default_channel"
  >
>;

export async function updateSettings(firmId: string, input: SettingsInput): Promise<void> {
  const fields = Object.keys(input);
  if (fields.length === 0) return;
  const sets = fields.map((f) => f + " = ?").join(", ");
  await exec("UPDATE firm_settings SET " + sets + ", updated_at = ? WHERE firm_id = ?", [
    ...fields.map((f) => (input as Record<string, unknown>)[f]),
    nowISO(),
    firmId,
  ]);
}

export async function updateFirm(firmId: string, input: { name?: string; city?: string; timezone?: string }) {
  const fields = Object.keys(input).filter((f) => (input as Record<string, unknown>)[f] !== undefined);
  if (fields.length === 0) return;
  const sets = fields.map((f) => f + " = ?").join(", ");
  await exec("UPDATE firms SET " + sets + " WHERE id = ?", [
    ...fields.map((f) => (input as Record<string, unknown>)[f]),
    firmId,
  ]);
}

// ----------------------------------------------------------------- api keys

export interface ApiKeyRow {
  id: string;
  firm_id: string;
  name: string;
  key_prefix: string;
  scopes: "read" | "write" | "admin";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function hashKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Mint a key. The plaintext is returned once and never stored — only its
 * SHA-256 hash goes to the database, so a dump of the table grants nothing.
 */
export async function createApiKey(
  firmId: string,
  name: string,
  scopes: ApiKeyRow["scopes"] = "read",
): Promise<{ id: string; plaintext: string; prefix: string }> {
  const secret = crypto.randomBytes(24).toString("base64url");
  const plaintext = "vahi_" + secret;
  const prefix = plaintext.slice(0, 12);
  const id = uid("key");
  await exec(
    `INSERT INTO api_keys (id, firm_id, name, key_prefix, key_hash, scopes, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, firmId, name, prefix, hashKey(plaintext), scopes, nowISO()],
  );
  return { id, plaintext, prefix };
}

export async function listApiKeys(firmId: string): Promise<ApiKeyRow[]> {
  return q<ApiKeyRow>(
    `SELECT id, firm_id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
       FROM api_keys WHERE firm_id = ? ORDER BY created_at DESC`,
    [firmId],
  );
}

export async function revokeApiKey(firmId: string, id: string): Promise<void> {
  await exec("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND firm_id = ? AND revoked_at IS NULL", [
    nowISO(),
    id,
    firmId,
  ]);
}

/** Resolve a presented key to its firm, or null. Updates last_used_at. */
export async function firmFromApiKey(
  plaintext: string,
): Promise<{ firmId: string; keyId: string; scopes: ApiKeyRow["scopes"] } | null> {
  if (!plaintext || !plaintext.startsWith("vahi_")) return null;
  const row = await one<{ id: string; firm_id: string; scopes: ApiKeyRow["scopes"] }>(
    "SELECT id, firm_id, scopes FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
    [hashKey(plaintext)],
  );
  if (!row) return null;
  // fire-and-forget: a failed touch must not fail the request
  exec("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [nowISO(), row.id]).catch(() => {});
  return { firmId: row.firm_id, keyId: row.id, scopes: row.scopes };
}

// ------------------------------------------------------- platform: firms

export interface FirmSummary extends Firm {
  members: number;
  invites: number;
  clients: number;
  filings: number;
  maxMembers: number | null;
}

/** Every firm with the numbers an operator actually needs. */
export async function firmSummaries(): Promise<FirmSummary[]> {
  return q<FirmSummary>(
    `SELECT f.id, f.name, f.city, f.slug, f.timezone, f.active,
            s.max_members AS "maxMembers",
            (SELECT COUNT(*) FROM memberships m WHERE m.firm_id = f.id) AS members,
            (SELECT COUNT(*) FROM invitations i WHERE i.firm_id = f.id AND i.claimed_at IS NULL) AS invites,
            (SELECT COUNT(*) FROM clients c WHERE c.firm_id = f.id) AS clients,
            (SELECT COUNT(*) FROM filings fl JOIN clients c2 ON c2.id = fl.client_id WHERE c2.firm_id = f.id) AS filings
       FROM firms f LEFT JOIN firm_settings s ON s.firm_id = f.id
      ORDER BY f.created_at ASC`,
  );
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "firm"
  );
}

/**
 * Create a tenant.
 *
 * Deliberately does NOT create any user account. The owner signs up
 * themselves against the invitation, so no password is ever minted by one
 * person and handed to another, and the owner verifies their own address.
 */
export async function createFirm(input: {
  name: string;
  city: string;
  timezone?: string;
  maxMembers?: number | null;
}): Promise<string> {
  const id = uid("firm");
  let slug = slugify(input.name);
  const taken = await one<{ id: string }>("SELECT id FROM firms WHERE slug = ?", [slug]);
  if (taken) slug = slug + "-" + id.slice(-4);

  await exec("INSERT INTO firms (id, name, city, slug, timezone, created_at) VALUES (?,?,?,?,?,?)", [
    id,
    input.name.trim(),
    input.city.trim(),
    slug,
    input.timezone ?? "Asia/Kolkata",
    nowISO(),
  ]);
  await exec("INSERT INTO firm_settings (firm_id, max_members, updated_at) VALUES (?,?,?)", [
    id,
    input.maxMembers ?? null,
    nowISO(),
  ]);
  return id;
}

export async function setFirmActive(firmId: string, active: boolean): Promise<void> {
  await exec("UPDATE firms SET active = ? WHERE id = ?", [active, firmId]);
}

export async function setMaxMembers(firmId: string, max: number | null): Promise<void> {
  await exec("UPDATE firm_settings SET max_members = ?, updated_at = ? WHERE firm_id = ?", [
    max,
    nowISO(),
    firmId,
  ]);
}
