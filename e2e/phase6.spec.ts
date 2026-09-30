import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const OFF = "http://localhost:3101"; // same database, LEADERBOARD_ENABLED=false

test("leaderboard: two tabs, display names only, opt-out hides you but your hours still count", async ({ page }) => {
  await signIn(page, "olly@gmail.com");
  await page.getByRole("link", { name: "Leaderboard" }).first().click();
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Total hours" })).toHaveAttribute("aria-selected", "true");
  const board = page.getByRole("list").filter({ hasText: "Olly Outsider" });
  await expect(board).toContainText("Olly Outsider");
  await expect(board).toContainText("You");
  await expect(page.getByText("olly@gmail.com")).toHaveCount(0); // names only, never emails
  await page.getByRole("tab", { name: "Attendance rate" }).click();
  await expect(page.getByText(/finished event/)).toBeVisible();

  // Opt out.
  await page.goto("/me");
  const saved = () => page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/me"));
  const toggle = page.getByRole("switch", { name: "Show me on the leaderboard" });
  let done = saved();
  await toggle.click();
  await done; // wait for the server to store it before navigating away
  await expect(toggle).not.toBeChecked();
  await page.goto("/leaderboard");
  await expect(page.getByText("You're hidden from this board")).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "Ada Admin" })).not.toContainText("Olly Outsider");
  // ...but admins still see their hours.
  await page.goto("/me");
  done = saved();
  await page.getByRole("switch", { name: "Show me on the leaderboard" }).click(); // show again
  await done;
  await expect(page.getByRole("switch", { name: "Show me on the leaderboard" })).toBeChecked();
});

test("parents never see the leaderboard", async ({ page }) => {
  await signIn(page, "pat@example.org");
  await page.goto("/leaderboard");
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByRole("link", { name: "Leaderboard" })).toHaveCount(0);
});

test("starting a new season archives the old one and resets the board", async ({ page }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/season");
  await page.getByRole("button", { name: "Start a new season…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Here's what happens")).toBeVisible();
  await expect(dialog.getByText(/Nothing is deleted/)).toBeVisible();
  await dialog.getByLabel("New season name").fill("2027 Season");
  // Must confirm first.
  await dialog.getByRole("button", { name: "Start new season" }).click();
  await expect(dialog.getByLabel("I understand the current season will be archived.")).toBeVisible();
  await dialog.getByLabel("I understand the current season will be archived.").check();
  await dialog.getByRole("button", { name: "Start new season" }).click();
  await expect(page.getByText("New season started")).toBeVisible();
  await expect(page.getByText("Archived seasons")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Season name" })).toHaveValue("2027 Season");

  // The new board is empty of hours; the archived one keeps them.
  await page.goto("/leaderboard");
  await expect(page.getByRole("list").filter({ hasText: "Ada Admin" }).first()).toContainText("0.0 h");
  await page.getByLabel("Season").selectOption({ label: /Season .*archived/ }).catch(async () => {
    const options = await page.getByLabel("Season").locator("option").allTextContents();
    const archived = options.find((o) => o.includes("archived"))!;
    await page.getByLabel("Season").selectOption({ label: archived });
  });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("· archived")).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "Olly Outsider" })).toContainText("h");
});

test("LEADERBOARD_ENABLED=false hides it everywhere, including navigation", async ({ page }) => {
  await signIn(page, "olly@gmail.com"); // cookies are shared across ports and both servers use one database
  await page.goto(`${OFF}/`);
  await expect(page.getByRole("heading", { name: /, Olly!$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Leaderboard" })).toHaveCount(0);
  const res = await page.goto(`${OFF}/leaderboard`);
  expect(res?.status()).toBe(404);
  await page.goto(`${OFF}/me`);
  await expect(page.getByText("Show me on the leaderboard")).toHaveCount(0);
});
