import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { parentLinks, users } from "@/db/schema";
import { adminIds, notify } from "@/lib/notify";

/** A parent edits and resubmits a `needs_info` link; it returns to `pending` for admin review. */
export async function resubmitParentLink(
  parentId: string,
  d: { linkId: string; fullName: string; relationship: string; phone?: string; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .update(parentLinks)
    .set({
      fullName: d.fullName.trim(),
      relationship: d.relationship,
      phone: d.phone?.trim() || null,
      note: d.note?.trim() || null,
      status: "pending",
      decidedAt: null,
      decidedBy: null,
    })
    .where(and(eq(parentLinks.id, d.linkId), eq(parentLinks.parentId, parentId), eq(parentLinks.status, "needs_info")))
    .returning({ studentId: parentLinks.studentId });
  const row = rows[0];
  if (!row) return { ok: false, error: "This request can't be edited right now." };
  const [student] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.studentId));
  await notify({
    userIds: await adminIds(),
    type: "parent_request",
    title: "Parent request updated",
    body: `${d.fullName} resubmitted their request to view ${student?.name ?? "a student"}.`,
    url: "/admin/review",
    dedupeKey: `parent-link:${d.linkId}:resubmit:${Date.now()}`,
  });
  return { ok: true };
}
