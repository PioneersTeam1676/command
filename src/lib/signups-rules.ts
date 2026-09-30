import type { Role, SignupAudience } from "@/db/schema";

/** Pure sign-up rules. No database in here, so every branch is cheap to unit test. */

export const AUDIENCE_LABEL: Record<SignupAudience, string> = { anyone: "Members and parents", members: "Members only", parents: "Parents only" };

/** Members, leads and admins are "members" for sign-up purposes; parents are their own audience. */
export function roleFitsAudience(role: Role, audience: SignupAudience): boolean {
  if (audience === "anyone") return true;
  return audience === "parents" ? role === "parent" : role !== "parent";
}

type Span = { startsAt: Date; endsAt: Date };

/** Half-open overlap: a shift ending at 11:00 and one starting at 11:00 do not overlap. */
export function slotsOverlap(a: Span, b: Span): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export type SlotClosedReason = "event_cancelled" | "sheet_closed" | "slot_cancelled" | "slot_over";

/** Why a slot can't take claims right now, or null when it is open. */
export function slotClosedReason(
  slot: Span & { cancelledAt: Date | null },
  ctx: { sheetClosedAt: Date | null; eventCancelledAt: Date | null },
  now: Date,
): SlotClosedReason | null {
  if (ctx.eventCancelledAt) return "event_cancelled";
  if (slot.cancelledAt) return "slot_cancelled";
  if (ctx.sheetClosedAt) return "sheet_closed";
  if (slot.endsAt <= now) return "slot_over";
  return null;
}

export const CLOSED_MESSAGE: Record<SlotClosedReason, string> = {
  event_cancelled: "This event was cancelled.",
  slot_cancelled: "This shift was cancelled.",
  sheet_closed: "Sign-ups are closed for this event.",
  slot_over: "This shift is already over.",
};
