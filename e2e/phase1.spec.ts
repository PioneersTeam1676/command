import { expect, test } from "@playwright/test";
import { PASSWORD, attemptSignIn, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("setup wizard creates the first admin, then /setup is gone", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup/);

  await page.getByLabel("Setup token").fill("wrong-token");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That token isn't right")).toBeVisible();

  await page.getByLabel("Setup token").fill("e2e-setup-token-1234");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Create the first admin" })).toBeVisible();

  await page.getByLabel("Full name").fill("Ada Admin");
  await page.getByLabel("Email").fill("admin@school.edu");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create admin" }).click();

  await expect(page.getByRole("heading", { name: "About your team" })).toBeVisible();
  await page.getByLabel("Team name").fill("Test Robotics");
  await page.getByLabel("Team number (optional)").fill("1234");
  // Pick a timezone where it is currently mid-day, so clock-in tests never run past the 9 PM cutoff.
  const tz = await page.evaluate(() => {
    const opts = [...document.querySelectorAll<HTMLOptionElement>("#f-timezone option")].map((o) => o.value);
    const hourIn = (z: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "numeric", hour12: false }).format(new Date())) % 24;
    return opts.find((z) => hourIn(z) >= 10 && hourIn(z) <= 16) ?? "UTC";
  });
  await page.getByLabel("Team timezone").selectOption(tz);
  await page.getByLabel("Auto-approved email domains (optional)").fill("school.edu");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Before you finish" })).toBeVisible();
  await expect(page.getByText("The registry check (required)")).toBeVisible();
  await page.getByLabel(/I.ve read the license/).check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: /Hi, Ada/ })).toBeVisible();

  expect((await page.request.get("/setup")).status()).toBe(404);
});

test("outsider signs up, waits, admin approves, outsider gets in", async ({ page, browser }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Olly Outsider");
  await page.getByLabel("Email").fill("olly@gmail.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Note for the admins (optional)").fill("Friend of the team");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, "admin@school.edu");
  await admin.goto("/admin/review");
  await expect(admin.getByText("Olly Outsider")).toBeVisible();
  await expect(admin.getByText("olly@gmail.com")).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("You're all caught up")).toBeVisible();

  await page.getByRole("link", { name: "Check status" }).click();
  await expect(page.getByRole("heading", { name: /Hi, Olly/ })).toBeVisible();
  await adminCtx.close();
});

test("wrong password gives a generic error", async ({ page }) => {
  await attemptSignIn(page, "admin@school.edu", "totally wrong password");
  await expect(page.getByText("That email and password don't match")).toBeVisible();
  await attemptSignIn(page, "nobody@nowhere.com", "totally wrong password");
  await expect(page.getByText("That email and password don't match")).toBeVisible();
});

test("parent link: invite, sign-up, approval, scoped access", async ({ page, browser }) => {
  // Student (Olly) creates an invite.
  await signIn(page, "olly@gmail.com");
  await page.goto("/me");
  await page.getByRole("button", { name: "Create parent invite link" }).click();
  const link = await page.getByLabel("Parent invite link").inputValue();
  expect(link).toContain("/invite/parent/");

  // Parent signs up through the link and submits details.
  const pCtx = await browser.newContext();
  const parent = await pCtx.newPage();
  await parent.goto(new URL(link).pathname);
  await expect(parent.getByRole("heading", { name: /Olly Outsider/ })).toBeVisible();
  await parent.getByLabel("Your full name").first().fill("Pat Parent");
  await parent.getByLabel("Email").first().fill("pat@example.org");
  await parent.getByLabel("Password").first().fill(PASSWORD);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent.getByRole("heading", { name: "Tell us about you" })).toBeVisible();
  await parent.getByLabel("Relationship to the student").selectOption("Mother");
  await parent.getByRole("button", { name: "Send request" }).click();
  await expect(parent.getByText("Waiting for review")).toBeVisible();

  // Admin asks for more info; parent resubmits; admin approves.
  const aCtx = await browser.newContext();
  const admin = await aCtx.newPage();
  await signIn(admin, "admin@school.edu");
  await admin.goto("/admin/review");
  await expect(admin.getByText("Pat Parent")).toBeVisible();
  await admin.getByRole("button", { name: "Ask for more info" }).click();
  await admin.getByLabel("Message to the parent").fill("Please add a phone number");
  await admin.getByRole("dialog").getByRole("button", { name: "Send request" }).click();
  await expect(admin.getByText("You're all caught up")).toBeVisible();

  await parent.reload();
  await expect(parent.getByText("Please add a phone number")).toBeVisible();
  await parent.getByLabel("Phone (optional)").fill("555-0100");
  await parent.getByRole("button", { name: "Resubmit" }).click();
  await expect(parent.getByText("Sent. We'll let you know")).toBeVisible();

  await admin.goto("/admin/review");
  await admin.getByRole("button", { name: "Approve" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("You're all caught up")).toBeVisible();

  await parent.goto("/parent");
  await parent.getByRole("link", { name: /View Olly/ }).click();
  await expect(parent.getByRole("heading", { name: "Olly Outsider" })).toBeVisible();

  // Tampering with the id in the URL: another student (the admin's user id is not a linked student).
  const res = await parent.request.get("/parent/00000000-0000-4000-8000-000000000000");
  expect(res.status()).toBe(404);
  // Parents cannot reach team pages.
  await parent.goto("/admin");
  await expect(parent).toHaveURL(/\/parent$/);

  await pCtx.close();
  await aCtx.close();
});
