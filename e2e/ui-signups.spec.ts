import { expect, test } from "@playwright/test";
import pg from "pg";
import { signIn } from "./helpers";

/** Runs after the phase specs (same database): relies on admin@school.edu and olly@gmail.com existing. */
async function seedShiftEvent() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command");
  url.pathname = "/cmd_e2e";
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into events (season_id, title, location_text, starts_at, ends_at, source)
       select id, 'Shareable Showcase', 'Main Hall', now() + interval '9 days', now() + interval '9 days 6 hours', 'app'
       from seasons where is_current returning id`,
    );
    const eventId = rows[0]!.id;
    const sheet = await pool.query<{ id: string }>(`insert into signup_sheets (event_id) values ($1) returning id`, [eventId]);
    const mk = async (title: string, audience: string, capacity: number, hours: number) =>
      (
        await pool.query<{ id: string }>(
          `insert into signup_slots (sheet_id, title, starts_at, ends_at, capacity, audience, kind)
           values ($1, $2, now() + interval '9 days' + make_interval(hours => $5), now() + interval '9 days' + make_interval(hours => $5 + 1), $4, $3, 'shift') returning id`,
          [sheet.rows[0]!.id, title, audience, capacity, hours],
        )
      ).rows[0]!.id;
    const open = await mk("Welcome table", "anyone", 3, 1);
    await mk("Members only crew", "members", 2, 3);
    const pit = await mk("Pit crew", "anyone", 2, 5);
    await pool.query(`insert into signup_entries (slot_id, user_id) select $1, id from users where email = 'olly@gmail.com'`, [pit]);
    await pool.query(`insert into signup_entries (slot_id, user_id) select $1, id from users where email = 'olly@gmail.com'`, [open]);
    await pool.query(`insert into signup_entries (slot_id, user_id) select $1, id from users where email = 'admin@school.edu'`, [open]);
    return eventId;
  } finally {
    await pool.end();
  }
}

test("the shareable link shows counts to anyone, never names, and sends people to sign in", async ({ browser }) => {
  const eventId = await seedShiftEvent();
  const ctx = await browser.newContext();
  const anon = await ctx.newPage();
  await anon.goto(`/shifts/${eventId}`);
  await expect(anon.getByRole("heading", { level: 1, name: "Shareable Showcase" })).toBeVisible();
  await expect(anon.getByText("Main Hall")).toBeVisible();
  await expect(anon.getByText("Welcome table")).toBeVisible();
  await expect(anon.getByText("2 of 3 signed up")).toBeVisible();
  await expect(anon.getByText("1 of 2 signed up")).toBeVisible();
  await expect(anon.getByText("Members only crew")).toHaveCount(0);
  const body = (await anon.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("olly");
  expect(body).not.toContain("admin@school.edu");
  const cta = anon.getByRole("link", { name: "Sign in to sign up" });
  await expect(cta).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/shifts/${eventId}`)}`);
  expect(await anon.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");

  // Not a real event, or not an id at all.
  expect((await anon.goto("/shifts/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
  expect((await anon.goto("/shifts/not-an-id"))?.status()).toBe(404);
  await ctx.close();
});

test("a signed-in member opening the link lands on the event, where they can copy it", async ({ page }) => {
  const eventId = await seedShiftEvent();
  await signIn(page, "admin@school.edu");
  await page.goto(`/shifts/${eventId}`);
  await expect(page).toHaveURL(new RegExp(`/calendar/${eventId}$`));
  await expect(page.getByRole("heading", { name: "Share these shifts" })).toBeVisible();
  await expect(page.getByLabel("Link to share")).toHaveValue(new RegExp(`/shifts/${eventId}$`));
});

test("the Sign-ups tab shows who else is on your shifts and who is on the ones you could take", async ({ page }) => {
  await seedShiftEvent();
  await signIn(page, "admin@school.edu");
  await page.goto("/me/shifts");
  await expect(page.getByRole("heading", { name: "Sign-ups", exact: true })).toBeVisible();
  // Shared shift: the admin holds it with Olly.
  await expect(page.getByText("With Olly Outsider").first()).toBeVisible();
  // Open shift: only Olly is on it so far.
  await expect(page.getByText("Signed up: Olly Outsider").first()).toBeVisible();
});
