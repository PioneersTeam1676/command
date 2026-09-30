import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Runs after the phase specs (same database): relies on admin@school.edu and olly@gmail.com existing. */
test.describe.configure({ mode: "serial" });

test("sign-up sheet: a lead builds shifts, a member claims, hits the overlap and full rules, and leaves", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/calendar/new");
  await page.getByLabel("Title").fill("Regional");
  await page.getByLabel("Starts").fill("2031-03-10T08:00");
  await page.getByLabel("Ends").fill("2031-03-10T18:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Regional" })).toBeVisible();
  const eventUrl = page.url();

  await page.getByRole("button", { name: "Add a sign-up sheet" }).click();
  await page.getByText("Add a shift").click();
  const add = async (title: string, start: string, end: string, capacity: string) => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add shift" }) });
    await form.getByLabel("Shift name").fill(title);
    await form.getByLabel("Starts").fill(start);
    await form.getByLabel("Ends").fill(end);
    await form.getByLabel("People needed").fill(capacity);
    await form.getByRole("button", { name: "Add shift" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title }).first()).toBeVisible();
  };
  await add("Pit crew", "2031-03-10T09:00", "2031-03-10T11:00", "1");
  await add("Scouting", "2031-03-10T10:00", "2031-03-10T12:00", "2");
  await add("Booth", "2031-03-10T11:00", "2031-03-10T13:00", "2");

  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(eventUrl);
  const shift = (name: string) => member.getByRole("listitem").filter({ hasText: name }).first();

  await shift("Pit crew").getByRole("button", { name: "Sign up" }).click();
  await expect(shift("Pit crew").getByText("You're signed up")).toBeVisible();
  await expect(shift("Pit crew").getByText(/1 of 1/)).toBeVisible();

  // Overlaps Pit crew (10:00-12:00 vs 9:00-11:00): refused with the reason.
  await shift("Scouting").getByRole("button", { name: "Sign up" }).click();
  await expect(shift("Scouting").getByRole("alert")).toContainText("overlaps");

  // Back-to-back is fine (Pit crew ends 11:00, Booth starts 11:00).
  await shift("Booth").getByRole("button", { name: "Sign up" }).click();
  await expect(shift("Booth").getByText("You're signed up")).toBeVisible();

  // Members can't see the lead controls or call lead actions.
  await expect(member.getByRole("button", { name: "Cancel shift" })).toHaveCount(0);
  await expect(member.getByText("Add a shift")).toHaveCount(0);

  // The lead sees who signed up.
  await page.goto(eventUrl);
  await expect(page.getByRole("listitem").filter({ hasText: "Pit crew" }).first()).toContainText("Signed up:");

  await shift("Pit crew").getByRole("button", { name: "Leave this shift" }).click();
  await expect(shift("Pit crew").getByRole("button", { name: "Sign up" })).toBeVisible();
  await expect(shift("Pit crew").getByText(/0 of 1/)).toBeVisible();

  // Closing the sheet stops new claims.
  await page.getByRole("button", { name: "Close sign-ups" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await member.reload();
  await expect(member.getByRole("button", { name: "Sign up" })).toHaveCount(0);
  await mCtx.close();
});
