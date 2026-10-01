import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Runs after the phase specs (same database): relies on admin@school.edu and olly@gmail.com existing. */
test.describe.configure({ mode: "serial" });

test("admin turns the shop on and adds a hoodie with sizes and stock", async ({ page }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/shop");
  await page.getByLabel("Open the shop").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved. The shop is open.")).toBeVisible();

  await page.getByRole("link", { name: "Add item" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Team hoodie");
  await page.getByLabel("Price ($)").fill("35");
  await page.getByLabel("Size name").first().fill("M");
  await page.getByLabel(/in stock/).first().fill("1");
  await page.getByRole("button", { name: "Add a size" }).click();
  await page.getByLabel("Size name").nth(1).fill("L");
  await page.getByLabel(/in stock/).nth(1).fill("4");
  await page.getByLabel("Print something on it?").selectOption("required");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Item saved.")).toBeVisible();
  await expect(page.getByText("M: 1 · L: 4")).toBeVisible();
});

test("admin sections fit without scrolling sideways", async ({ page }) => {
  await signIn(page, "admin@school.edu");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin sections" });
  await expect(nav.getByRole("link", { name: "Today" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "System" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a member orders with print text, and stock goes down", async ({ page }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Shop" }).click();
  await expect(page).toHaveURL(/\/shop$/);
  const card = page.getByRole("group", { name: "Team hoodie" });
  await card.getByLabel("Size").selectOption({ label: "M (1 left)" });
  await card.getByRole("button", { name: "Add to order" }).click();
  await expect(card.getByText("Type what should be printed.")).toBeVisible();
  await card.getByLabel(/Name to print/).fill("  Alex   R. ");
  await card.getByRole("button", { name: "Add to order" }).click();
  const order = page.getByRole("complementary", { name: "Your order" });
  await expect(order.getByText("Alex R.")).toBeVisible();
  await expect(order.getByText(/hand a mentor \$35/)).toBeVisible();
  await order.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/shop\/orders\?placed=1/);
  await expect(page.getByText("Order placed.")).toBeVisible();
  await expect(page.getByText("Hand a mentor the money", { exact: true })).toBeVisible();

  await page.goto("/shop");
  await expect(page.getByRole("option", { name: "M (sold out)" })).toHaveAttribute("disabled", "");
});

test("admin sees the order, marks it paid and delivered, and the shop page passes axe", async ({ page }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/shop/orders");
  await expect(page.getByText("Print: Alex R.")).toBeVisible();
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
  const csv = await page.request.get("/api/export/shop");
  expect(await csv.text()).toContain("Alex R.");
  for (const url of ["/admin/shop", "/admin/shop/orders", "/shop"]) {
    await page.goto(url);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  }
});
