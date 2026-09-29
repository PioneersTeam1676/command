import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { parentInvites, parentLinks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashToken, randomToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { adminIds, notify } from "@/lib/notify";

const DAY = 24 * 60 * 60 * 1000;
export const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Step-parent", "Other"] as const;
export type LinkStatus = "pending" | "needs_info" | "approved" | "denied";

const appUrl = () => getEnv().APP_URL.replace(/\/$/, "");

/** A student creates an invite. Returns the raw link once; only its hash is stored. */
export async function createParentInvite(studentId: string) {
  const token = randomToken();
  await db.insert(parentInvites).values({ studentId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * DAY) });
  return { url: `${appUrl()}/invite/parent/${token}` };
}

export async function listInvites(studentId: string) {
  return db
    .select({ id: parentInvites.id, expiresAt: parentInvites.expiresAt, revokedAt: parentInvites.revokedAt, usedCount: parentInvites.usedCount, createdAt: parentInvites.createdAt })
    .from(parentInvites)
    .where(eq(parentInvites.studentId, studentId))
    .orderBy(desc(parentInvites.createdAt));
}

/** Invites that can still be used right now. */
export async function activeInvites(studentId: string) {
  const now = Date.now();
  return (await listInvites(studentId)).filter((i) => !i.revokedAt && i.expiresAt.getTime() > now);
}

export async function revokeInvite(studentId: string, inviteId: string) {
  await db
    .update(parentInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(parentInvites.id, inviteId), eq(parentInvites.studentId, studentId), isNull(parentInvites.revokedAt)));
}

/** Resolve a raw invite token. Returns the student's display name or null if unusable. */
export async function resolveInvite(token: string) {
  const [row] = await db
    .select({ inviteId: parentInvites.id, studentId: parentInvites.studentId, studentName: users.name, studentStatus: users.status })
    .from(parentInvites)
    .innerJoin(users, eq(users.id, parentInvites.studentId))
    .where(and(eq(parentInvites.tokenHash, hashToken(token)), isNull(parentInvites.revokedAt), gt(parentInvites.expiresAt, sql`now()`)));
  if (!row || row.studentStatus !== "active") return null;
  return row;
}

export type ParentDetails = { fullName: string; relationship: string; phone?: string; note?: string };

/** Create or resubmit a link request from an invite. */
export async function submitParentLink(parentId: string, inviteToken: string, details: ParentDetails) {
  const invite = await resolveInvite(inviteToken);
  if (!invite) return { ok: false as const, error: "This invite link has expired or was revoked. Ask the student for a new one." };

  const [existing] = await db
    .select()
    .from(parentLinks)
    .where(and(eq(parentLinks.parentId, parentId), eq(parentLinks.studentId, invite.studentId)));
  if (existing && (existing.status === "approved" && !existing.revokedAt)) {
    return { ok: false as const, error: "You're already linked to this student." };
  }
  if (existing && existing.status === "pending") {
    return { ok: false as const, error: "Your request is already waiting for review." };
  }

  const values = {
    relationship: details.relationship,
    fullName: details.fullName.trim(),
    phone: details.phone?.trim() || null,
    note: details.note?.trim() || null,
    status: "pending",
    adminMessage: null,
    decidedBy: null,
    decidedAt: null,
    revokedAt: null,
  };
  let linkId: string;
  if (existing) {
    await db.update(parentLinks).set(values).where(eq(parentLinks.id, existing.id));
    linkId = existing.id;
  } else {
    const [row] = await db.insert(parentLinks).values({ parentId, studentId: invite.studentId, ...values }).returning({ id: parentLinks.id });
    linkId = row!.id;
    await db.update(parentInvites).set({ usedCount: sql`${parentInvites.usedCount} + 1` }).where(eq(parentInvites.id, invite.inviteId));
  }
  await notify({
    userIds: await adminIds(),
    type: "parent_request",
    title: "New parent link request",
    body: `${details.fullName} (${details.relationship}) wants to view ${invite.studentName}.`,
    url: "/admin/review",
    dedupeKey: `parent-link:${linkId}:${Date.now()}`,
  });
  return { ok: true as const, linkId };
}

const STATUS_TEXT: Record<Exclude<LinkStatus, "pending">, string> = {
  approved: "Your request to view your student's information was approved.",
  denied: "Your request to view your student's information was not approved.",
  needs_info: "The team needs a bit more information before approving your request.",
};

export async function decideParentLink(
  actorId: string,
  linkId: string,
  decision: "approved" | "denied" | "needs_info",
  message?: string,
) {
  const [link] = await db.select().from(parentLinks).where(eq(parentLinks.id, linkId));
  if (!link) return { ok: false as const, error: "Request not found." };
  if (link.status !== "pending") return { ok: false as const, error: "That request was already handled." };
  if (decision === "needs_info" && !message?.trim()) return { ok: false as const, error: "Tell the parent what you need from them." };

  await db.transaction(async (tx) => {
    await tx
      .update(parentLinks)
      .set({ status: decision, adminMessage: message?.trim() || null, decidedBy: actorId, decidedAt: new Date(), revokedAt: null })
      .where(eq(parentLinks.id, linkId));
    await audit(
      { actorId, action: `parent_link.${decision}`, targetType: "parent_link", targetId: linkId, before: { status: link.status }, after: { status: decision, message: message ?? null } },
      tx,
    );
  });
  const [parent] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, link.parentId));
  if (parent) {
    const body = `${STATUS_TEXT[decision]}${message?.trim() ? ` Message: ${message.trim()}` : ""}`;
    await notify({
      userIds: [parent.id],
      type: "parent_status",
      title: "Update on your parent request",
      body,
      url: "/parent",
      dedupeKey: `parent-status:${linkId}:${decision}:${Date.now()}`,
      emailFallback: { subject: "Update on your Command parent request", text: `Hi ${parent.name},\n\n${body}\n\nSign in to see details: ${appUrl()}/parent` },
    });
  }
  return { ok: true as const };
}

/** Student or admin revokes an approved link. */
export async function revokeParentLink(actorId: string, linkId: string, opts: { onlyStudentId?: string } = {}) {
  const conditions = [eq(parentLinks.id, linkId), isNull(parentLinks.revokedAt)];
  if (opts.onlyStudentId) conditions.push(eq(parentLinks.studentId, opts.onlyStudentId));
  const rows = await db.update(parentLinks).set({ revokedAt: new Date() }).where(and(...conditions)).returning({ id: parentLinks.id, status: parentLinks.status });
  if (rows.length === 0) return { ok: false as const };
  await audit({ actorId, action: "parent_link.revoke", targetType: "parent_link", targetId: linkId, before: { status: rows[0]!.status } });
  return { ok: true as const };
}

export async function linksForParent(parentId: string) {
  return db
    .select({
      id: parentLinks.id,
      status: parentLinks.status,
      adminMessage: parentLinks.adminMessage,
      relationship: parentLinks.relationship,
      fullName: parentLinks.fullName,
      phone: parentLinks.phone,
      note: parentLinks.note,
      revokedAt: parentLinks.revokedAt,
      studentId: parentLinks.studentId,
      studentName: users.name,
    })
    .from(parentLinks)
    .innerJoin(users, eq(users.id, parentLinks.studentId))
    .where(eq(parentLinks.parentId, parentId))
    .orderBy(desc(parentLinks.createdAt));
}

export async function linksForStudent(studentId: string) {
  return db
    .select({ id: parentLinks.id, status: parentLinks.status, relationship: parentLinks.relationship, fullName: parentLinks.fullName, revokedAt: parentLinks.revokedAt })
    .from(parentLinks)
    .where(eq(parentLinks.studentId, studentId))
    .orderBy(desc(parentLinks.createdAt));
}
