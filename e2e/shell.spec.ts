import { expect, test } from "@playwright/test";
import pg from "pg";
import { signIn } from "./helpers";

test("dock order, avatar to Me, no back link, and solid header on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "olly@gmail.com");
  await page.goto("/");

  const dock = page.getByRole("navigation", { name: "Main" }).last();
  const labels = await dock.getByRole("link").allInnerTexts();
  expect(labels.slice(0, 4).map((l) => l.trim())).toEqual(["Home", "Attendance", "Sign-ups", "Calendar"]);

  const header = page.locator("header").first();
  const style = await header.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, filter: s.backdropFilter };
  });
  expect(style.filter === "none" || style.filter === "").toBe(true);
  expect(style.bg).not.toMatch(/rgba\(.*,\s*0?\.\d+\)/);

  await page.getByRole("link", { name: "Me", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("heading", { name: "Let a parent follow along" })).toBeVisible();
  await expect(page.getByText("Put my shifts in my calendar")).toBeVisible();
  await expect(page.getByText("View my hours")).toHaveCount(0);

  await page.goto("/me/hours");
  await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
  await expect(page.getByText("← Me")).toHaveCount(0);
  await page.goto("/me/shifts");
  await expect(page.getByText("← Me")).toHaveCount(0);
});

test("calendar no longer shows the team timezone line", async ({ page }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Team calendar" }).first()).toBeVisible();
  await expect(page.getByText(/^Team timezone/)).toHaveCount(0);
});

test("avatar link is reachable and nothing overflows at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await signIn(page, "olly@gmail.com");
  await page.goto("/");
  await expect(page.locator("header").first().getByRole("link", { name: "Me" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("a profile photo that fails to load falls back to initials", async ({ page }) => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command");
  url.pathname = "/cmd_e2e";
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    await pool.query("update users set avatar_url = 'https://lh3.googleusercontent.com/a/broken=s96-c' where email = 'olly@gmail.com'");
    await page.route("**/lh3.googleusercontent.com/**", (route) => route.abort());
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "olly@gmail.com");
    await page.goto("/me");
    const link = page.locator("header").first().getByRole("link", { name: "Me" });
    await expect(link.locator("img")).toHaveCount(0);
    await expect(link).toHaveText(/^[A-Z]{1,2}$/);
  } finally {
    await pool.query("update users set avatar_url = null where email = 'olly@gmail.com'");
    await pool.end();
  }
});
