import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Runs after phase1.spec.ts (same database): relies on admin@school.edu and olly@gmail.com existing. */
test.describe.configure({ mode: "serial" });

test("set build season, create an event, sign up to attend, edit, cancel", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");

  await page.goto("/admin/season");
  await page.getByLabel("Build season starts").fill("2026-01-03");
  await page.getByLabel("Build season ends").fill("2027-02-18");
  await page.getByRole("button", { name: "Save season" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/calendar/new");
  await page.getByLabel("Title").fill("Build Day");
  await page.getByLabel("Starts").fill("2030-06-10T18:00");
  await page.getByLabel("Ends").fill("2030-06-10T20:30");
  await page.getByLabel("Location (optional)").fill("Shop");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Build Day" })).toBeVisible();
  await expect(page.getByText("6:00 PM – 8:30 PM")).toBeVisible();
  const eventUrl = page.url();

  await page.goto("/calendar?view=month&date=2030-06-01");
  await expect(page.getByRole("link", { name: /Build Day/ })).toBeVisible();

  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(eventUrl);
  await member.getByLabel("Add a note (optional)").fill("Car trouble");
  await member.getByRole("button", { name: "I'm going" }).click();
  await expect(member.getByText("You're signed up.")).toBeVisible();
  await expect(member.getByRole("heading", { name: "You're going" })).toBeVisible();
  const editRes = await member.request.get(`${eventUrl}/edit`, { maxRedirects: 0 });
  expect([302, 307]).toContain(editRes.status());

  await page.goto(eventUrl);
  await expect(page.getByText("Car trouble")).toBeVisible();
  await page.getByText("Haven't signed up").click();
  await expect(page.locator("details").filter({ hasText: "Haven't signed up" })).toContainText("Ada Admin");

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Build Day (moved)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Build Day (moved)" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel event" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel event" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

  await member.goto(eventUrl);
  await expect(member.getByText("Will you be there?")).toHaveCount(0);
  await mCtx.close();
});
