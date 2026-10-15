import { describe, expect, it } from "vitest";
import { isMePath, isNavActive, mobileNav, navItems } from "./nav";

const member = { leaderboardEnabled: true, isStaff: false, shopOpen: false };
const labels = (o: Parameters<typeof navItems>[0]) => navItems(o).map((i) => i.label);

describe("navItems", () => {
  it("orders members: Home, Attendance, Sign-ups, Calendar, Leaderboard", () => {
    expect(labels(member)).toEqual(["Home", "Attendance", "Sign-ups", "Calendar", "Leaderboard"]);
  });
  it("has no Me entry", () => {
    expect(labels(member)).not.toContain("Me");
  });
  it("omits Leaderboard when disabled and adds Shop when open", () => {
    expect(labels({ ...member, leaderboardEnabled: false, shopOpen: true })).toEqual(["Home", "Attendance", "Sign-ups", "Calendar", "Shop"]);
  });
  it("keeps the parent nav as it was", () => {
    expect(labels({ ...member, isParent: true })).toEqual(["Home", "Calendar", "Shifts"]);
  });
});

describe("mobileNav", () => {
  it("shows all five when there are five", () => {
    const { bar, more } = mobileNav(navItems(member));
    expect(bar).toHaveLength(5);
    expect(more).toHaveLength(0);
  });
  it("moves Shop and Leaderboard behind More when both exist", () => {
    const { bar, more } = mobileNav(navItems({ ...member, shopOpen: true }));
    expect(bar.map((i) => i.label)).toEqual(["Home", "Attendance", "Sign-ups", "Calendar"]);
    expect(more.map((i) => i.label)).toEqual(["Shop", "Leaderboard"]);
  });
});

describe("isNavActive", () => {
  it("matches Home only on the root", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/calendar", "/")).toBe(false);
  });
  it("matches Attendance and Sign-ups by prefix", () => {
    expect(isNavActive("/me/hours", "/me/hours")).toBe(true);
    expect(isNavActive("/me/hours/anything", "/me/hours")).toBe(true);
    expect(isNavActive("/me/shifts", "/me/shifts")).toBe(true);
    expect(isNavActive("/me", "/me/hours")).toBe(false);
  });
  it("keeps parent Home from lighting up on parent Calendar or Shifts", () => {
    expect(isNavActive("/parent", "/parent")).toBe(true);
    expect(isNavActive("/parent/calendar", "/parent")).toBe(false);
    expect(isNavActive("/parent/calendar", "/parent/calendar")).toBe(true);
  });
});

describe("isMePath", () => {
  it("is true for Me and its settings pages, false for Attendance and Sign-ups", () => {
    expect(isMePath("/me")).toBe(true);
    expect(isMePath("/me/notifications")).toBe(true);
    expect(isMePath("/me/hours")).toBe(false);
    expect(isMePath("/me/shifts")).toBe(false);
    expect(isMePath("/calendar")).toBe(false);
  });
});
