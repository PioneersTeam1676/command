import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

const T = (s: string) => new Date(s);

describe.skipIf(!hasTestDb)("new season and the leaderboard", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let oldSeasonId: string;
  const ev: Record<string, string> = {};

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, events, attendanceSessions } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "UTC", setupCompletedAt: new Date() });
    const [s] = await db.insert(seasons).values({ name: "2026 Season", startDate: "2026-01-01", isCurrent: true, buildStart: "2026-01-03", buildEnd: "2026-02-18", workdays: [1, 2, 3, 4, 5] }).returning();
    oldSeasonId = s!.id;
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent" = "member", extra: object = {}) => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active", ...extra }).returning({ id: users.id }))[0]!.id;
    };
    await mk("admin", "admin");
    await mk("ann");
    await mk("bob");
    await mk("shy", "member", { leaderboardHidden: true });
    await mk("mom", "parent");
    const e = async (key: string, start: string, end: string, extra: object = {}) => {
      ev[key] = (await db.insert(events).values({ seasonId: oldSeasonId, title: key, startsAt: T(start), endsAt: T(end), ...extra }).returning({ id: events.id }))[0]!.id;
    };
    await e("past1", "2026-03-01T18:00:00Z", "2026-03-01T20:00:00Z");
    await e("past2", "2026-03-08T18:00:00Z", "2026-03-08T20:00:00Z");
    await e("cancelledPast", "2026-03-15T18:00:00Z", "2026-03-15T20:00:00Z", { cancelledAt: T("2026-03-10T00:00:00Z") });
    await e("future", "2030-01-10T18:00:00Z", "2030-01-10T20:00:00Z");
    const sess = (userKey: string, inAt: string, outAt: string, extra: object = {}) =>
      db.insert(attendanceSessions).values({ userId: u[userKey]!, seasonId: oldSeasonId, kind: "open", localDate: inAt.slice(0, 10), clockInAt: T(inAt), clockOutAt: T(outAt), status: "closed", ...extra });
    const evSess = (userKey: string, key: string, inAt: string, outAt: string, extra: object = {}) =>
      db.insert(attendanceSessions).values({ userId: u[userKey]!, seasonId: oldSeasonId, kind: "event", eventId: ev[key]!, localDate: inAt.slice(0, 10), clockInAt: T(inAt), clockOutAt: T(outAt), status: "closed", ...extra });
    await sess("ann", "2026-01-05T15:00:00Z", "2026-01-05T18:00:00Z"); // 3h
    await sess("ann", "2026-01-06T15:00:00Z", "2026-01-06T17:00:00Z", { reviewState: "rejected" }); // not counted
    await evSess("ann", "past1", "2026-03-01T18:00:00Z", "2026-03-01T20:00:00Z"); // 2h
    await evSess("ann", "past2", "2026-03-08T18:00:00Z", "2026-03-08T20:00:00Z"); // 2h
    await sess("bob", "2026-01-05T15:00:00Z", "2026-01-05T20:00:00Z"); // 5h
    await evSess("bob", "past1", "2026-03-01T18:30:00Z", "2026-03-01T20:00:00Z", { reviewState: "pending_approval", origin: "backfill" }); // pending: not counted
    await sess("shy", "2026-01-05T15:00:00Z", "2026-01-05T23:00:00Z"); // 8h but hidden
  });
  afterAll(async () => {
    await drop?.();
  });

  it("board excludes opted-out members and parents, and only counts what counts", async () => {
    const { leaderboardEntries, rankEntries, myStats } = await import("./leaderboard");
    const now = T("2026-04-01T00:00:00Z");
    const { entries, endedEvents } = await leaderboardEntries(oldSeasonId, now);
    expect(endedEvents).toBe(2); // past1, past2 (cancelled and future excluded)
    expect(entries.map((e) => e.name).sort()).toEqual(["admin", "ann", "bob"]);
    const hours = rankEntries(entries, "hours");
    expect(hours.map((h) => [h.name, Math.round(h.hours * 10) / 10])).toEqual([["bob", 5], ["ann", 7], ["admin", 0]].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(hours[0]).toMatchObject({ name: "ann", rank: 1 });
    const att = rankEntries(entries, "attendance");
    expect(att[0]).toMatchObject({ name: "ann", eventsAttended: 2, attendanceRate: 1 });
    expect(att.find((a) => a.name === "bob")!.attendanceRate).toBe(0); // pending backfill doesn't count as attended
    // Hidden member still sees their own stats.
    const mine = await myStats(u.shy!, oldSeasonId, now);
    expect(Math.round(mine!.hours)).toBe(8);
  });

  it("roster counts outreach events attended, by the same rules as events attended", async () => {
    const { rosterForSeason } = await import("./roster");
    const { db } = await import("@/db");
    const { events } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(events).set({ isOutreach: true }).where(eq(events.id, ev.past1!));
    const rows = await rosterForSeason(oldSeasonId, "UTC");
    const by = (k: string) => rows.find((r) => r.userId === u[k])!;
    expect(by("ann")).toMatchObject({ eventsAttended: 2, outreachAttended: 1 });
    expect(by("bob")).toMatchObject({ eventsAttended: 0, outreachAttended: 0 }); // pending approval doesn't count
    await db.update(events).set({ isOutreach: false }).where(eq(events.id, ev.past1!));
  });

  it("starting a new season archives the old one, resets the board, and keeps history", async () => {
    const { startNewSeason, getCurrentSeason, listSeasons } = await import("./seasons");
    const { db } = await import("@/db");
    const { events, seasons, attendanceSessions, auditLog } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { leaderboardEntries } = await import("./leaderboard");
    const today = new Date().toISOString().slice(0, 10);
    const r = await startNewSeason(u.admin!, { name: "2027 Season", startDate: today, buildStart: null, buildEnd: null, workdays: [1, 2, 3, 4, 5] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const current = await getCurrentSeason();
    expect(current).toMatchObject({ id: r.id, name: "2027 Season", isCurrent: true });
    const all = await listSeasons();
    expect(all.filter((s) => s.isCurrent)).toHaveLength(1); // exactly one current season
    const [old] = await db.select().from(seasons).where(eq(seasons.id, oldSeasonId));
    expect(old!.isCurrent).toBe(false);
    expect(old!.endDate).not.toBeNull();
    // Old data is intact and its board is still viewable; the new one starts empty.
    expect((await db.select().from(attendanceSessions).where(eq(attendanceSessions.seasonId, oldSeasonId))).length).toBe(7); // the 7 sessions seeded above
    const oldBoard = await leaderboardEntries(oldSeasonId, T("2026-04-01T00:00:00Z"));
    expect(oldBoard.entries.find((e) => e.name === "ann")!.hours).toBeGreaterThan(6);
    const newBoard = await leaderboardEntries(r.id, new Date());
    expect(newBoard.entries.every((e) => e.hours === 0)).toBe(true);
    // Future event moved to the new season; past events stayed.
    const [future] = await db.select().from(events).where(eq(events.id, ev.future!));
    const [past] = await db.select().from(events).where(eq(events.id, ev.past1!));
    expect(future!.seasonId).toBe(r.id);
    expect(past!.seasonId).toBe(oldSeasonId);
    expect((await db.select().from(auditLog)).some((a) => a.action === "season.start_new")).toBe(true);
  });

  it("refuses a future start, a start before the current season, and empty names", async () => {
    const { startNewSeason } = await import("./seasons");
    expect((await startNewSeason(u.admin!, { name: "Future", startDate: "2099-01-01", buildStart: null, buildEnd: null, workdays: [1] })).ok).toBe(false);
    expect((await startNewSeason(u.admin!, { name: "Past", startDate: "2020-01-01", buildStart: null, buildEnd: null, workdays: [1] })).ok).toBe(false);
    expect((await startNewSeason(u.admin!, { name: "  ", startDate: new Date().toISOString().slice(0, 10), buildStart: null, buildEnd: null, workdays: [1] })).ok).toBe(false);
  });
});
