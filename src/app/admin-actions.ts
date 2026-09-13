"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/lib/guest";
import { redirect } from "next/navigation";
import { currentUser, inviteToFirm, SeatLimitReached, type Role } from "@/lib/auth";
import { createFirm, setFirmActive, setMaxMembers } from "@/lib/tenant";
import { audit, logger } from "@/lib/log";
import { runAsFirm } from "@/lib/tenant";

/**
 * Platform operations.
 *
 * Every one re-checks that the caller is a platform admin. Relying on the page
 * having checked would mean a server action reachable by anyone who knows its
 * id — actions are endpoints, not page internals.
 */
async function requirePlatformAdmin() {
  const user = await currentUser();
  if (!user?.platformAdmin) {
    logger.warn("admin.denied", { userId: user?.id ?? "anonymous" });
    throw new Error("Not permitted.");
  }
  return user;
}

export async function createFirmAction(fd: FormData) {
  await assertWritable();
  const admin = await requirePlatformAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const city = String(fd.get("city") ?? "").trim();
  const rawMax = String(fd.get("maxMembers") ?? "").trim();
  const ownerEmail = String(fd.get("ownerEmail") ?? "").trim().toLowerCase();
  if (!name || !city) return;

  const firmId = await createFirm({
    name,
    city,
    maxMembers: rawMax ? Number(rawMax) || null : null,
  });

  // The owner is invited, never created. They sign up themselves, verify their
  // own address, and no password passes through anyone else's hands.
  if (ownerEmail) {
    await inviteToFirm(firmId, ownerEmail, "owner", admin.email);
  }

  await runAsFirm({ firmId, actor: admin.email, actorKind: "USER" }, () =>
    audit({
      action: "firm.created",
      entity: "firm",
      entityId: firmId,
      detail: { name, city, maxMembers: rawMax || null, ownerInvited: ownerEmail || null },
    }),
  );
  revalidatePath("/admin");
}

export async function setSeatsAction(firmId: string, fd: FormData) {
  await assertWritable();
  const admin = await requirePlatformAdmin();
  const raw = String(fd.get("maxMembers") ?? "").trim();
  const max = raw ? Number(raw) || null : null;
  await setMaxMembers(firmId, max);
  await runAsFirm({ firmId, actor: admin.email, actorKind: "USER" }, () =>
    audit({ action: "firm.seats_changed", entity: "firm", entityId: firmId, detail: { maxMembers: max } }),
  );
  revalidatePath("/admin");
}

export async function toggleFirmActiveAction(firmId: string, active: boolean) {
  await assertWritable();
  const admin = await requirePlatformAdmin();
  await setFirmActive(firmId, active);
  await runAsFirm({ firmId, actor: admin.email, actorKind: "USER" }, () =>
    audit({ action: active ? "firm.reactivated" : "firm.suspended", entity: "firm", entityId: firmId }),
  );
  revalidatePath("/admin");
}

export async function inviteOwnerAction(firmId: string, fd: FormData) {
  await assertWritable();
  const admin = await requirePlatformAdmin();
  const email = String(fd.get("ownerEmail") ?? "").trim().toLowerCase();
  const role = (String(fd.get("role") ?? "owner") as Role) ?? "owner";
  if (!email) return;
  try {
    await inviteToFirm(firmId, email, role, admin.email);
  } catch (e) {
    // a full firm is a normal state, not a fault — say so on the page rather
    // than throwing a stack trace at the operator
    if (e instanceof SeatLimitReached) redirect("/admin?seats=" + encodeURIComponent(e.message));
    throw e;
  }
  await runAsFirm({ firmId, actor: admin.email, actorKind: "USER" }, () =>
    audit({ action: "firm.owner_invited", entity: "firm", entityId: firmId, detail: { email, role } }),
  );
  revalidatePath("/admin");
}
