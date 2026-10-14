import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("an admin permanently deletes an attendance entry and it vanishes for the member too", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu"); //obv this wouldnt work without actual email :O
  await page.goto("/admin/roster");
  await page.getByRole("link", {name: /Olly Outsider/}).click();

  const before = await page.getByRole("button", { name: "Delete", exact: true}).count();

  await page.getByRole("button", { name: "Delete"}).first().click();
  await page.getByRole("dialog").getByRole("button", {name: "Delete permanently"}).click();

  await expect(page.getByRole("button", { name: "Delete", exact: true})).toHaveCount(before - 1);

  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto("/me/hours");
  await expect(member.getByText("Build season clock-in")).toHaveCount(before-1);
  await ctx.close();
});
