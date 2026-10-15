import { expect, test } from "@playwright/test";
import pg from "pg";
import { signIn } from "./helpers";

/** Runs after the phase specs (same database): relies on admin@school.edu and olly@gmail.com existing. */
async function withDb<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command");
  url.pathname = "/cmd_e2e";
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

/** A finished, unreviewed entry for Olly in the current season, `daysAgo` days back, `hours` long, with a marker note. */
async function seedEntry(note: string, daysAgo: number, hours: number) {
  await withDb((pool) =>
    pool.query(
      `insert into attendance_sessions (user_id, season_id, kind, local_date, clock_in_at, clock_out_at, status, origin, review_state, note)
       select u.id, s.id, 'open',
              ((date_trunc('day', now()) - make_interval(days => $2) + interval '14 hours') at time zone (select timezone from team_settings limit 1))::date,
              date_trunc('day', now()) - make_interval(days => $2) + interval '14 hours',
              date_trunc('day', now()) - make_interval(days => $2) + interval '14 hours' + make_interval(hours => $3),
              'closed', 'live', 'none', $1
       from users u, seasons s where u.email = 'olly@gmail.com' and s.is_current`,
      [note, daysAgo, hours],
    ),
  );
}

test("a lead can mark an unusual entry as fine", async ({ page }) => {
  await seedEntry("e2e-long-day", 6, 14);
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/review");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Looks unusual" }) });
  await expect(card.getByText("Very long").first()).toBeVisible();
  await card.getByRole("button", { name: "Looks fine" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Looks fine" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Reviewed entries stop showing as unusual to the member as well.
  await page.goto("/admin/review");
  await expect(page.getByRole("heading", { name: "Looks unusual" })).toHaveCount(0);
});

test("a member fixes their own entry, a lead sees it and puts it back", async ({ browser }) => {
  await seedEntry("e2e-normal", 3, 3);

  const member = await (await browser.newContext()).newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto("/me/hours");
  const row = member.locator("li", { hasText: "e2e-normal" });
  await row.getByText("Fix or remove").click();
  const inValue = await row.getByLabel("In", { exact: true }).inputValue();
  const outValue = new Date(`${inValue}:00Z`);
  outValue.setUTCHours(outValue.getUTCHours() + 1);
  await row.getByLabel("Out", { exact: true }).fill(outValue.toISOString().slice(0, 16));
  await row.getByLabel("What happened?").fill("Left early for an appointment");
  await row.getByRole("button", { name: "Save change" }).click();
  await expect(row.getByText("Change waiting for a lead").first()).toBeVisible();
  // The edit controls go away while a request is waiting, and the hours already changed.
  await expect(row.getByText("Fix or remove")).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "admin@school.edu");
  await admin.goto("/admin/review");
  const req = admin.locator("section", { has: admin.getByRole("heading", { name: "Changes to check" }) });
  await expect(req.getByText("Left early for an appointment")).toBeVisible();
  await expect(req.getByText("Was:")).toBeVisible();
  await req.getByRole("button", { name: "Put it back" }).first().click();
  await admin.getByRole("dialog").getByRole("button", { name: "Put it back" }).click();
  await expect(admin.getByRole("dialog")).toHaveCount(0);

  await member.goto("/me/hours");
  const back = member.locator("li", { hasText: "e2e-normal" });
  await expect(back.getByText("Change waiting for a lead")).toHaveCount(0);
  await expect(back.getByText("Fix or remove")).toBeVisible();
  await member.context().close();
  await admin.context().close();
});

test("Admin shows how many things are waiting", async ({ page }) => {
  await seedEntry("e2e-badge", 9, 14);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "admin@school.edu");
  await page.goto("/");
  await expect(page.locator("header").first().getByRole("link", { name: /^Admin\b.*waiting for review/ })).toBeVisible();
});
