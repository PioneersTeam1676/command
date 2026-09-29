import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Automated WCAG A/AA scan (both themes) of the main screens. Runs last, against the data the other specs created. */
test.describe.configure({ mode: "serial" });

async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await page.waitForTimeout(400); // let client components settle (theme, push panel)
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${path}`).toEqual([]);
}

const PUBLIC = ["/login", "/signup", "/forgot", "/terms", "/privacy", "/license"];
const MEMBER = ["/", "/calendar", "/calendar?view=agenda", "/calendar?view=week", "/me", "/me/hours", "/me/notifications", "/leaderboard"];
const ADMIN = ["/admin", "/admin/review", "/admin/here", "/admin/roster", "/admin/people", "/admin/season", "/admin/notifications", "/admin/exports", "/admin/audit", "/admin/settings", "/calendar/new"];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    test("public pages", async ({ page }) => {
      for (const p of PUBLIC) await scan(page, p);
    });
    test("member pages", async ({ page }) => {
      await signIn(page, "olly@gmail.com");
      for (const p of MEMBER) await scan(page, p);
    });
    test("admin pages", async ({ page }) => {
      await signIn(page, "admin@school.edu");
      for (const p of ADMIN) await scan(page, p);
    });
  });
}

test("keyboard: the skip link reaches the main content and every page has one h1", async ({ page }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/me");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  for (const p of ["/", "/calendar", "/me", "/me/hours"]) {
    await page.goto(p);
    expect(await page.locator("h1").count(), p).toBe(1);
  }
});
