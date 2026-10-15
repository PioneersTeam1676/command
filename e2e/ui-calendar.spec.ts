import { expect, test } from "@playwright/test";
import pg from "pg";
import { signIn } from "./helpers";

/** Runs after the phase specs (same database): relies on admin@school.edu existing. */
const LONG_TITLE = "FIRST Robotics Competition Regional Qualification Matches and Pit Setup, Inspection, Practice Rounds and Awards Ceremony Day 1";
const LONG_URL = "https://www.firstinspires.org/robotics/frc/events/2026-regional-districts/pit-administration/very-long-path-name-that-does-not-break-nicely-0123456789?utm_source=newsletter&utm_medium=email";
const DESCRIPTION = `Load-in starts at 7am. Bring safety glasses, closed toe shoes, and your team shirt.\n\nSchedule and pit map: ${LONG_URL}\n\nParents are welcome. ${"Questions go to a mentor in the team chat. ".repeat(8)}`;

async function seedEvent() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command");
  url.pathname = "/cmd_e2e";
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    const { rows } = await pool.query(
      `insert into events (season_id, title, description, location_text, starts_at, ends_at, source, ics_uid, rsvp_enabled)
       select id, $1, $2, 'Convention Center, Exhibit Hall B, Level 2, 1234 Very Long Boulevard Name Street, Springfield, State 12345',
              now() + interval '2 days', now() + interval '2 days 3 hours', 'imported', 'polish-' || gen_random_uuid() || '@test', false
       from seasons order by created_at desc limit 1
       returning id, to_char(starts_at at time zone (select timezone from team_settings limit 1), 'YYYY-MM-DD') as day`,
      [LONG_TITLE, DESCRIPTION],
    );
    return rows[0] as { id: string; day: string };
  } finally {
    await pool.end();
  }
}

test("tapping a day opens the agenda for that day, empty days included", async ({ page }) => {
  const ev = await seedEvent();
  await signIn(page, "admin@school.edu");
  await page.goto(`/calendar?view=month&date=${ev.day}`);
  await expect(page.getByRole("heading", { name: "Team calendar" })).toBeVisible();

  await page.locator(`a[href*="view=agenda&date=${ev.day}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`view=agenda&date=${ev.day}`));
  await expect(page.getByRole("link", { name: new RegExp(LONG_TITLE.slice(0, 30)) })).toBeVisible();

  // A day with nothing on it still opens an agenda, and says so.
  const empty = new Date(`${ev.day}T12:00:00Z`);
  empty.setUTCDate(empty.getUTCDate() + 20);
  const emptyDay = empty.toISOString().slice(0, 10);
  await page.goto(`/calendar?view=month&date=${ev.day}`);
  const cell = page.locator(`a[href*="view=agenda&date=${emptyDay}"]`).first();
  if (await cell.count()) {
    await cell.click();
    await expect(page.getByText("Nothing scheduled.")).toBeVisible();
  } else {
    await page.goto(`/calendar?view=agenda&date=${emptyDay}`);
    await expect(page.getByText("Nothing scheduled.")).toBeVisible();
  }
});

test("a long event stays inside the screen, links are clickable and details collapse", async ({ page }) => {
  const ev = await seedEvent();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "admin@school.edu");
  await page.goto(`/calendar/${ev.id}`);
  await expect(page.getByRole("heading", { level: 1, name: LONG_TITLE })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  const link = page.getByRole("link", { name: /firstinspires\.org/ });
  await expect(link).toHaveAttribute("href", LONG_URL);
  await expect(link).toHaveAttribute("rel", /noopener/);

  const more = page.getByRole("button", { name: "Show more" });
  await more.click();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(page.getByText("Synced events start without a sign-up button.")).toBeVisible();
});
