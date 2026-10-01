import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`admin sections render on the first click at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await signIn(page, "admin@school.edu");
    await page.goto("/admin");
    const tabs = page.getByRole("navigation", { name: "Admin sections" });
    const main = page.getByRole("main");
    // Check actual content, not just the URL or selected tab: those changed even
    // when the old theme metadata code crashed React's navigation commit.
    const sections = [
      { group: "Today", href: "/admin/here", content: main.getByText("Everyone who is clocked in right now.", { exact: false }) },
      { group: "People", href: "/admin/people", content: main.getByText("Everyone with an account.", { exact: false }) },
      { group: "Team", href: "/admin/season", content: main.getByText("Current season", { exact: true }) },
      { group: "Team", href: "/admin/notifications", content: main.getByText("Who can actually receive reminders", { exact: false }) },
      { group: "System", href: "/admin/exports", content: main.getByText("Hours per member", { exact: true }) },
      { group: "System", href: "/admin/audit", content: main.getByLabel("What", { exact: true }) },
      { group: "System", href: "/admin/settings", content: main.getByLabel("Team name", { exact: true }) },
      { group: "People", href: "/admin/roster", content: main.getByRole("button", { name: "Show", exact: true }) },
      { group: "Today", href: "/admin/review", content: main.getByText("You're all caught up", { exact: true }) },
      { group: "Today", href: "/admin", content: main.getByText("Coming up", { exact: true }) },
    ];
    await expect(sections.at(-1)!.content).toBeVisible();
    // Two levels: a few group tabs on top, then only the open group's links underneath.
    for (const { group, href, content } of sections) {
      await tabs.locator("ul").first().getByRole("link", { name: group, exact: true }).click();
      const link = tabs.locator("ul").nth(1).locator(`a[href="${href}"]`);
      await link.click();
      await expect(page).toHaveURL(href);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(content).toBeVisible();
    }
    await page.goBack();
    await expect(sections[8].content).toBeVisible();
    await page.goForward();
    await expect(sections[9].content).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("theme color follows the selected theme through navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, "admin@school.edu");
  await page.goto("/me");
  const color = page.locator('head meta[name="theme-color"]');
  await expect(color).toHaveCount(1);
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(color).toHaveAttribute("content", "#000000");
  await page.getByRole("link", { name: "Admin", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("Coming up", { exact: true })).toBeVisible();
  await expect(color).toHaveCount(1);
  await expect(color).toHaveAttribute("content", "#000000");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(color).toHaveAttribute("content", "#000000");
  await page.getByRole("link", { name: "Me", exact: true }).filter({ visible: true }).click();
  await page.getByRole("radio", { name: "System", exact: true }).click();
  await expect(color).toHaveAttribute("content", "#ffffff");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(color).toHaveAttribute("content", "#000000");
  expect(errors).toEqual([]);
});
