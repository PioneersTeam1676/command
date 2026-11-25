import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { teamSettings, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { readSettings } from "@/lib/settings";
import { nameSchema } from "@/lib/validation";

/**
 * The tech lead is a permanent designation on top of a lead/admin account. It is claimed exactly
 * once from TECH_LEAD_EMAIL; after that the env var is never read again, and a database trigger
 * (migration 0020) rejects any attempt to change or transfer it.
 */

export async function getTechLeadId(): Promise<string | null> {
  return (await readSettings()).techLeadUserId;
}

export async function isTechLead(userId: string): Promise<boolean> {
  return (await getTechLeadId()) === userId;
}

/** Who can hold the designation. Leads and admins only, so the tech lead always reaches the admin area. */
export function eligibleForTechLead(u: { role: Role; status: string }): boolean {
  return u.status === "active" && (u.role === "lead" || u.role === "admin");
}

/**
 * Claim the tech lead from TECH_LEAD_EMAIL if nobody holds it yet. Safe to call often: it is a
 * no-op once claimed (or when the env var is unset / the account isn't eligible yet).
 * Returns the tech lead's id, if any.
 */
export async function claimTechLead(): Promise<string | null> {
  const settings = await readSettings();
  if (settings.techLeadUserId) return settings.techLeadUserId;
  const email = getEnv().TECH_LEAD_EMAIL;
  if (!email) return null;
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (!u || !eligibleForTechLead(u)) return null;
  const claimed = await db.transaction(async (tx) => {
    // Conditional update: only wins if nobody claimed it in the meantime.
    const rows = await tx
      .update(teamSettings)
      .set({ techLeadUserId: u.id, techLeadClaimedAt: new Date() })
      .where(and(eq(teamSettings.id, 1), isNull(teamSettings.techLeadUserId)))
      .returning({ id: teamSettings.techLeadUserId });
    if (rows.length === 0) return false;
    await audit({ actorId: null, action: "tech_lead.claim", targetType: "user", targetId: u.id, after: { name: u.name } }, tx);
    return true;
  });
  if (claimed) console.log(`[tech-lead] ${u.name} is now the tech lead. This is permanent; TECH_LEAD_EMAIL is no longer read.`);
  return claimed ? u.id : getTechLeadId();
}

/** Like claimTechLead, but never throws: used on boot and sign-in where it must not block anything. */
export async function tryClaimTechLead(): Promise<void> {
  try {
    await claimTechLead();
  } catch (e) {
    console.error("[tech-lead] claim failed:", e);
  }
}

type Result = { ok: true } | { ok: false; error: string };

/** Rename any account. Only the tech lead can do this. */
export async function renameUser(actorId: string, userId: string, rawName: string): Promise<Result> {
  if (!(await isTechLead(actorId))) return { ok: false, error: "Only the tech lead can rename people." };
  const parsed = nameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  if (u.email.endsWith("@deleted.invalid")) return { ok: false, error: "This account's data was erased." };
  if (u.name === parsed.data) return { ok: true };
  await db.update(users).set({ name: parsed.data }).where(eq(users.id, userId));
  await audit({ actorId, action: "user.rename", targetType: "user", targetId: userId, before: { name: u.name }, after: { name: parsed.data } });
  return { ok: true };
}
