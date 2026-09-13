import { currentUser, authConfigured } from "./auth";
import { logger } from "./log";

/**
 * Read-only guest mode.
 *
 * Set DEMO_GUEST=1 and anyone with the link can look around without signing
 * in — and cannot change anything. It exists because the alternative people
 * reach for is sharing one login, which is worse in every way: a password to
 * leak, no idea who looked, and a visitor who can delete the demo for
 * everyone else.
 *
 * A guest is not a user. There is no session, no membership, no audit
 * identity; they see whichever firm the deployment resolves to by default.
 * Never enable this on a deployment holding a real client list.
 */

export function guestModeEnabled(): boolean {
  return process.env.DEMO_GUEST === "1" || process.env.DEMO_GUEST === "true";
}

/** True when this request is an unauthenticated visitor in guest mode. */
export async function isGuest(): Promise<boolean> {
  if (!guestModeEnabled()) return false;
  if (!authConfigured()) return false;
  const user = await currentUser();
  return user === null;
}

export class ReadOnlyDemo extends Error {
  constructor() {
    super("This is a read-only demo. Sign in to make changes.");
    this.name = "ReadOnlyDemo";
  }
}

/**
 * Refuse a write from a guest.
 *
 * Called at the top of every mutating server action. Guarding the UI alone
 * would be theatre: a server action is an endpoint, and anyone who can open
 * the page can invoke it directly.
 */
export async function assertWritable(): Promise<void> {
  if (await isGuest()) {
    logger.warn("guest.write_blocked");
    throw new ReadOnlyDemo();
  }
}
