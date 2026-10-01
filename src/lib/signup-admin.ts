import { and, asc, eq, gt, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, groupMembers, parentLinks, signupEntries, signupSheets, signupSlotGroups, signupSlots, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { csvResponse, toCsv } from "@/lib/csv";
import { notify } from "@/lib/notify";
import { approvedStudentIds } from "@/lib/parent-scope";
import { getSeason } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { notifyPromoted, promoteWaitlist, signupUrl, type Promoted, type SlotRow } from "@/lib/signups";
import { claimGate, roleFitsAudience, slotsOverlap } from "@/lib/signups-rules";
import { formatInTz, localDateOf } from "@/lib/time";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
export type Person = { id: string; name: string; role: Role };
export type Skipped = { userId: string; name: string; reason: string };

const HOUR = 3_600_000;

// ---------- Placing and removing people (leads and admins) ----------

/**
 * Put people on a shift directly. Group gates don't apply (the lead is choosing), but the audience, the
 * overlap rule and the account checks still do. Someone already queued is moved onto the shift. Going over
 * capacity needs `overbook`, and is refused as a whole so a lead never gets a half-done placement.
 */
export async function assignPeople(actorId: string, slotId: string, userIds: string[], opts: { overbook?: boolean } = {}, now: Date = new Date()): Promise<Result<{ assigned: number; skipped: Skipped[] }>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { ok: false, error: "Pick at least one person." };
  const outcome = await db.transaction(async (tx): Promise<Result<{ assigned: { userId: string; entryId: string; role: Role }[]; skipped: Skipped[]; slot: SlotRow; eventId: string }>> => {
    const [slot] = await tx.select().from(signupSlots).where(eq(signupSlots.id, slotId)).for("update");
    if (!slot) return { ok: false, error: "That shift doesn't exist." };
    if (slot.cancelledAt) return { ok: false, error: "This shift was cancelled." };
    if (slot.endsAt <= now) return { ok: false, error: "This shift is already over." };
    const [sheet] = await tx.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
    const [event] = await tx.select({ cancelledAt: events.cancelledAt }).from(events).where(eq(events.id, sheet!.eventId));
    if (event?.cancelledAt) return { ok: false, error: "This event was cancelled." };

    const people = await tx.select({ id: users.id, name: users.name, role: users.role, status: users.status }).from(users).where(inArray(users.id, ids));
    const approved = new Set<string>();
    for (const p of people) if (p.role === "parent" && (await approvedStudentIds(p.id, tx)).length > 0) approved.add(p.id);
    const here = await tx.select().from(signupEntries).where(eq(signupEntries.slotId, slotId));
    const elsewhere = await tx
      .select({ userId: signupEntries.userId, title: signupSlots.title, startsAt: signupSlots.startsAt, endsAt: signupSlots.endsAt })
      .from(signupEntries)
      .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
      .where(and(inArray(signupEntries.userId, ids), eq(signupSlots.sheetId, slot.sheetId), eq(signupSlots.kind, "shift"), ne(signupSlots.id, slotId), isNull(signupSlots.cancelledAt)));

    const skipped: Skipped[] = [];
    const eligible: typeof people = [];
    for (const p of people) {
      const skip = (reason: string) => skipped.push({ userId: p.id, name: p.name, reason });
      if (p.status !== "active") skip("their account isn't active");
      else if (!roleFitsAudience(p.role, slot.audience)) skip(slot.audience === "parents" ? "this shift is for parents" : "this shift is for team members");
      else if (p.role === "parent" && !approved.has(p.id)) skip("their link to a student isn't approved");
      else if (here.some((e) => e.userId === p.id && e.status === "confirmed")) skip("already on this shift");
      else {
        const clash = slot.kind === "shift" ? elsewhere.find((e) => e.userId === p.id && slotsOverlap(e, slot)) : undefined;
        if (clash) skip(`clashes with “${clash.title}”`);
        else eligible.push(p);
      }
    }
    if (eligible.length === 0) return { ok: true, assigned: [], skipped, slot, eventId: sheet!.eventId };

    const confirmed = here.filter((e) => e.status === "confirmed").length;
    const over = confirmed + eligible.length - slot.capacity;
    if (over > 0 && !opts.overbook) {
      return { ok: false, error: `That would put ${over} ${over === 1 ? "person" : "people"} over the ${slot.capacity} places. Tick “Place them even if it's over” to go over.`, field: "overbook" };
    }
    const assigned: { userId: string; entryId: string; role: Role }[] = [];
    for (const p of eligible) {
      const [row] = await tx
        .insert(signupEntries)
        .values({ slotId, userId: p.id, status: "confirmed", source: "admin", assignedBy: actorId })
        .onConflictDoUpdate({ target: [signupEntries.slotId, signupEntries.userId], set: { status: "confirmed", source: "admin", assignedBy: actorId } })
        .returning({ id: signupEntries.id });
      assigned.push({ userId: p.id, entryId: row!.id, role: p.role });
    }
    await audit({ actorId, action: "signup.assign", targetType: "signup_slot", targetId: slotId, after: { title: slot.title, userIds: assigned.map((a) => a.userId), overbooked: over > 0 } }, tx);
    return { ok: true, assigned, skipped, slot, eventId: sheet!.eventId };
  });
  if (!outcome.ok) return outcome;

  const { timezone } = await getSettings();
  for (const a of outcome.assigned) {
    await notify({
      userIds: [a.userId],
      type: "signup_change",
      title: `You've been added: ${outcome.slot.title}`,
      body: `A lead put you on this shift. ${formatInTz(outcome.slot.startsAt, timezone, "EEE MMM d, h:mm a")}`,
      url: signupUrl(a.role, outcome.eventId),
      dedupeKey: `signup:${a.entryId}:assigned`,
    }).catch(() => undefined);
  }
  return { ok: true, assigned: outcome.assigned.length, skipped: outcome.skipped };
}

/** Put every active member of a group on a shift. People who can't be placed are reported, not errors. */
export async function assignGroup(actorId: string, slotId: string, groupId: string, opts: { overbook?: boolean } = {}, now: Date = new Date()) {
  const members = await db
    .select({ id: groupMembers.userId })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(users.status, "active")));
  if (members.length === 0) return { ok: false as const, error: "Nobody is in that group yet." };
  return assignPeople(actorId, slotId, members.map((m) => m.id), opts, now);
}

/** Take someone off a shift (or off its waitlist). A freed place goes to the next person in line. */
export async function removeEntry(actorId: string, entryId: string): Promise<Result> {
  const outcome = await db.transaction(async (tx): Promise<Result<{ slot: SlotRow; eventId: string; userId: string; role: Role; promoted: Promoted[] }>> => {
    const [found] = await tx.select({ slotId: signupEntries.slotId }).from(signupEntries).where(eq(signupEntries.id, entryId));
    if (!found) return { ok: false, error: "That person is no longer on this shift." };
    const [slot] = await tx.select().from(signupSlots).where(eq(signupSlots.id, found.slotId)).for("update");
    const [entry] = await tx.select().from(signupEntries).where(eq(signupEntries.id, entryId));
    if (!slot || !entry) return { ok: false, error: "That person is no longer on this shift." };
    const [sheet] = await tx.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
    const [who] = await tx.select({ role: users.role }).from(users).where(eq(users.id, entry.userId));
    await tx.delete(signupEntries).where(eq(signupEntries.id, entryId));
    const promoted = entry.status === "confirmed" ? await promoteWaitlist(tx, slot) : [];
    await audit({ actorId, action: "signup.remove", targetType: "signup_slot", targetId: slot.id, before: { title: slot.title, userId: entry.userId, status: entry.status } }, tx);
    return { ok: true, slot, eventId: sheet!.eventId, userId: entry.userId, role: who?.role ?? "member", promoted };
  });
  if (!outcome.ok) return outcome;
  const { timezone } = await getSettings();
  await notify({
    userIds: [outcome.userId],
    type: "signup_change",
    title: `You were taken off: ${outcome.slot.title}`,
    body: formatInTz(outcome.slot.startsAt, timezone, "EEE MMM d, h:mm a"),
    url: signupUrl(outcome.role, outcome.eventId),
    dedupeKey: `signup:${entryId}:removed`,
  }).catch(() => undefined);
  await notifyPromoted(outcome.slot, outcome.promoted);
  return { ok: true };
}

/** Active people who could be placed on a shift right now and aren't on it yet. */
export async function eligiblePeople(slotId: string): Promise<Person[]> {
  const [slot] = await db.select().from(signupSlots).where(eq(signupSlots.id, slotId));
  if (!slot) return [];
  const holding = db.select({ id: signupEntries.userId }).from(signupEntries).where(eq(signupEntries.slotId, slotId));
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.status, "active"), sql`${users.id} not in (${holding})`))
    .orderBy(asc(users.name));
  const fit = rows.filter((r) => roleFitsAudience(r.role, slot.audience));
  const parents = fit.filter((r) => r.role === "parent");
  if (parents.length === 0) return fit;
  const linked = new Set((await approvedParentIds()));
  return fit.filter((r) => r.role !== "parent" || linked.has(r.id));
}

async function approvedParentIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: parentLinks.parentId })
    .from(parentLinks)
    .innerJoin(users, eq(users.id, parentLinks.studentId))
    .where(and(eq(parentLinks.status, "approved"), isNull(parentLinks.revokedAt), eq(users.status, "active")));
  return rows.map((r) => r.id);
}

// ---------- Who hasn't signed up ----------

/**
 * People with no place (or queue spot) on the sheet who could take at least one open shift right now.
 * Shifts that are full with no waitlist, over, cancelled or not yet open to them don't count.
 */
export async function unsignedPeople(sheetId: string, now: Date = new Date()): Promise<Person[]> {
  const [sheet] = await db.select().from(signupSheets).where(eq(signupSheets.id, sheetId));
  if (!sheet || sheet.closedAt) return [];
  const [event] = await db.select({ cancelledAt: events.cancelledAt }).from(events).where(eq(events.id, sheet.eventId));
  if (event?.cancelledAt) return [];
  const slots = await db.select().from(signupSlots).where(and(eq(signupSlots.sheetId, sheetId), ne(signupSlots.kind, "attend"), isNull(signupSlots.cancelledAt), gt(signupSlots.endsAt, now)));
  if (slots.length === 0) return [];
  const slotIds = slots.map((s) => s.id);
  const entries = await db.select({ slotId: signupEntries.slotId, userId: signupEntries.userId, status: signupEntries.status }).from(signupEntries).innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId)).where(and(eq(signupSlots.sheetId, sheetId), ne(signupSlots.kind, "attend"), isNull(signupSlots.cancelledAt)));
  const holders = new Set(entries.map((e) => e.userId));
  const open = slots.filter((s) => entries.filter((e) => e.slotId === s.id && e.status === "confirmed").length < s.capacity || s.waitlistEnabled);
  if (open.length === 0) return [];
  const slotGroups = await db.select({ slotId: signupSlotGroups.slotId, groupId: signupSlotGroups.groupId }).from(signupSlotGroups).where(inArray(signupSlotGroups.slotId, slotIds));
  const memberships = slotGroups.length ? await db.select({ userId: groupMembers.userId, groupId: groupMembers.groupId }).from(groupMembers) : [];
  const everyone = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name));
  const linked = new Set(await approvedParentIds());
  return everyone.filter((p) => {
    if (holders.has(p.id)) return false;
    if (p.role === "parent" && !linked.has(p.id)) return false;
    const mine = memberships.filter((m) => m.userId === p.id).map((m) => m.groupId);
    return open.some((s) => {
      if (!roleFitsAudience(p.role, s.audience)) return false;
      const gids = slotGroups.filter((g) => g.slotId === s.id).map((g) => g.groupId);
      return claimGate({ slotGroupIds: gids, opensToAllAt: s.opensToAllAt, userGroupIds: mine, now }).state === "open";
    });
  });
}

/**
 * Remind everyone who hasn't signed up. Once per sheet per day (a double tap, or a second lead, can't
 * double-send). Returns who was reminded and how many were left out because they'd already been reminded today.
 */
export async function nudgeSheet(actorId: string, sheetId: string, now: Date = new Date()): Promise<Result<{ reminded: number; alreadyToday: boolean }>> {
  const [sheet] = await db.select().from(signupSheets).where(eq(signupSheets.id, sheetId));
  if (!sheet) return { ok: false, error: "That sign-up sheet doesn't exist." };
  if (sheet.closedAt) return { ok: false, error: "Sign-ups are closed, so there's nothing to remind people about." };
  const [event] = await db.select().from(events).where(eq(events.id, sheet.eventId));
  const targets = await unsignedPeople(sheetId, now);
  if (targets.length === 0) return { ok: true, reminded: 0, alreadyToday: false };
  const { timezone } = await getSettings();
  const day = localDateOf(now, timezone);
  let reminded = 0;
  for (const isParent of [false, true]) {
    reminded += await notify({
      userIds: targets.filter((t) => (t.role === "parent") === isParent).map((t) => t.id),
      type: "signup_open",
      title: `Shifts still open: ${event!.title}`,
      body: "Pick one you can help with.",
      url: signupUrl(isParent ? "parent" : "member", sheet.eventId),
      dedupeKey: `signup-nudge:${sheetId}:${day}`,
    });
  }
  if (reminded > 0) await audit({ actorId, action: "signup.nudge", targetType: "event", targetId: sheet.eventId, after: { reminded } });
  return { ok: true, reminded, alreadyToday: reminded === 0 };
}

// ---------- Scheduled notices (called every minute by the signups.tick job) ----------

const REMINDERS = [
  { key: "24h", before: 24 * HOUR },
  { key: "1h", before: HOUR },
] as const;

/**
 * Shift reminders (a day and an hour before) and "now open to everyone" notices. Every send is keyed in
 * `notification_log`, so overlapping or repeated ticks never double-send. A reminder only goes to someone
 * who was already on the shift at that point, so signing up 20 minutes before doesn't earn a "1 hour" ping.
 */
export async function runSignupNotices(now: Date = new Date()): Promise<{ reminders: number; opened: number }> {
  const { timezone } = await getSettings();
  let reminders = 0;
  let opened = 0;

  // --- Reminders
  const soon = await db
    .select({ slot: signupSlots, eventId: signupSheets.eventId, eventCancelledAt: events.cancelledAt })
    .from(signupSlots)
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .where(and(isNull(signupSlots.cancelledAt), ne(signupSlots.kind, "attend"), gt(signupSlots.startsAt, now), lte(signupSlots.startsAt, new Date(now.getTime() + 24 * HOUR))));
  for (const { slot, eventId, eventCancelledAt } of soon) {
    if (eventCancelledAt) continue;
    const held = await db
      .select({ entryId: signupEntries.id, userId: signupEntries.userId, role: users.role, since: sql<Date>`coalesce(${signupEntries.promotedAt}, ${signupEntries.createdAt})` })
      .from(signupEntries)
      .innerJoin(users, eq(users.id, signupEntries.userId))
      .where(and(eq(signupEntries.slotId, slot.id), eq(signupEntries.status, "confirmed"), eq(users.status, "active")));
    for (const r of REMINDERS) {
      const at = new Date(slot.startsAt.getTime() - r.before);
      if (now < at) continue;
      const targets = held.filter((h) => new Date(h.since) < at);
      for (const isParent of [false, true]) {
        reminders += await notify({
          userIds: targets.filter((t) => (t.role === "parent") === isParent).map((t) => t.userId),
          type: "signup_reminder",
          title: r.key === "1h" ? `Your shift starts in about an hour: ${slot.title}` : `Your shift is tomorrow: ${slot.title}`,
          body: formatInTz(slot.startsAt, timezone, "EEE MMM d, h:mm a"),
          url: signupUrl(isParent ? "parent" : "member", eventId),
          dedupeKey: `signup-remind:${slot.id}:${r.key}`,
        });
      }
    }
  }

  // --- "Now open to everyone" for shifts that gave a group first pick (recent openings only)
  const opening = await db
    .select({ slot: signupSlots, sheetClosedAt: signupSheets.closedAt, eventId: signupSheets.eventId, eventCancelledAt: events.cancelledAt })
    .from(signupSlots)
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .where(and(isNull(signupSlots.cancelledAt), ne(signupSlots.kind, "attend"), gt(signupSlots.endsAt, now), lte(signupSlots.opensToAllAt, now), gte(signupSlots.opensToAllAt, new Date(now.getTime() - 6 * HOUR))));
  for (const { slot, sheetClosedAt, eventId, eventCancelledAt } of opening) {
    if (sheetClosedAt || eventCancelledAt) continue;
    const [taken] = await db.select({ n: sql<number>`count(*)::int` }).from(signupEntries).where(and(eq(signupEntries.slotId, slot.id), eq(signupEntries.status, "confirmed")));
    if ((taken?.n ?? 0) >= slot.capacity && !slot.waitlistEnabled) continue;
    const people = await unsignedForSlot(slot, now);
    for (const isParent of [false, true]) {
      opened += await notify({
        userIds: people.filter((p) => (p.role === "parent") === isParent).map((p) => p.id),
        type: "signup_open",
        title: `Shift open to everyone: ${slot.title}`,
        body: formatInTz(slot.startsAt, timezone, "EEE MMM d, h:mm a"),
        url: signupUrl(isParent ? "parent" : "member", eventId),
        dedupeKey: `signup-open:${slot.id}`,
      });
    }
  }
  return { reminders, opened };
}

/** People who can take this one shift and aren't on it (used for "now open" notices). */
async function unsignedForSlot(slot: SlotRow, now: Date): Promise<Person[]> {
  const holding = db.select({ id: signupEntries.userId }).from(signupEntries).where(eq(signupEntries.slotId, slot.id));
  const rows = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.status, "active"), sql`${users.id} not in (${holding})`));
  const linked = new Set(await approvedParentIds());
  const gids = (await db.select({ id: signupSlotGroups.groupId }).from(signupSlotGroups).where(eq(signupSlotGroups.slotId, slot.id))).map((g) => g.id);
  const inGroup = new Set((gids.length ? await db.select({ userId: groupMembers.userId }).from(groupMembers).where(inArray(groupMembers.groupId, gids)) : []).map((m) => m.userId));
  // The group already knew about it (they had first pick), so this is for everyone else.
  return rows.filter((r) => roleFitsAudience(r.role, slot.audience) && (r.role !== "parent" || linked.has(r.id)) && !inGroup.has(r.id) && claimGate({ slotGroupIds: gids, opensToAllAt: slot.opensToAllAt, userGroupIds: [], now }).state === "open");
}

/** Tell a new group-reserved shift's group members they have first pick. Called after the shift is created. */
export async function notifyFirstPickById(slotId: string) {
  const [slot] = await db.select().from(signupSlots).where(eq(signupSlots.id, slotId));
  if (!slot || slot.cancelledAt) return;
  const [sheet] = await db.select({ eventId: signupSheets.eventId }).from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
  const groupIds = (await db.select({ id: signupSlotGroups.groupId }).from(signupSlotGroups).where(eq(signupSlotGroups.slotId, slotId))).map((g) => g.id);
  await notifyFirstPick(slot, groupIds, sheet!.eventId);
}

async function notifyFirstPick(slot: SlotRow, groupIds: string[], eventId: string) {
  if (groupIds.length === 0) return;
  const { timezone } = await getSettings();
  const members = await db
    .select({ id: users.id, role: users.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(inArray(groupMembers.groupId, groupIds), eq(users.status, "active")));
  const people = members.filter((m) => roleFitsAudience(m.role, slot.audience));
  const body = slot.opensToAllAt ? `You get first pick until ${formatInTz(slot.opensToAllAt, timezone, "EEE MMM d, h:mm a")}.` : "This shift is reserved for your group.";
  for (const isParent of [false, true]) {
    await notify({
      userIds: people.filter((p) => (p.role === "parent") === isParent).map((p) => p.id),
      type: "signup_open",
      title: `First pick: ${slot.title}`,
      body,
      url: signupUrl(isParent ? "parent" : "member", eventId),
      dedupeKey: `signup-first:${slot.id}`,
    }).catch(() => undefined);
  }
}

// ---------- CSV ----------

/** Every place and queue spot on every event in a season, one row each. Admin only. */
export async function exportSignups(seasonId: string, tz: string) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const rows = await db
    .select({ e: events, slot: signupSlots, entry: signupEntries, name: users.name, role: users.role })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(and(eq(events.seasonId, seasonId), ne(signupSlots.kind, "attend")))
    .orderBy(asc(events.startsAt), asc(signupSlots.startsAt), asc(signupEntries.status), asc(signupEntries.createdAt));
  const body = rows.map(({ e, slot, entry, name, role }) => [
    e.title,
    formatInTz(e.startsAt, tz, "yyyy-MM-dd HH:mm"),
    slot.title,
    formatInTz(slot.startsAt, tz, "yyyy-MM-dd HH:mm"),
    formatInTz(slot.endsAt, tz, "yyyy-MM-dd HH:mm"),
    slot.cancelledAt ? "cancelled" : "",
    name,
    role,
    entry.status,
    entry.source === "admin" ? "placed by a lead" : "signed up themselves",
    entry.createdAt,
  ]);
  return csvResponse(`signups-${season.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`, toCsv(["Event", "Event starts", "Shift", "Shift starts", "Shift ends", "Shift status", "Person", "Role", "Status", "How", "Signed up at"], body));
}
