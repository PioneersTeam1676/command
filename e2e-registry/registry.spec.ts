import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { expect, test, type Page } from "@playwright/test";

/** Real registry + real Command talking over HTTP. Command (port 3400) is in development mode so it may point at the local registry. */
test.describe.configure({ mode: "serial" });

const REGISTRY = "http://localhost:3300";
const PASSWORD = "correct horse battery staple";
const ownerToken = randomBytes(24).toString("base64url");

async function ownerPage(browser: import("@playwright/test").Browser): Promise<Page> {
  // Owner sign-in is Google-only, so give the test an owner session directly in the registry database.
  const pool = new pg.Pool({ connectionString: process.env.E2E_REGISTRY_DB, max: 1 });
  await pool.query("insert into sessions (id, expires_at) values ($1, now() + interval '1 day') on conflict do nothing", [createHash("sha256").update(ownerToken).digest("hex")]);
  await pool.end();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "reg_session", value: ownerToken, url: REGISTRY }]);
  return ctx.newPage();
}

async function checkNow(page: Page) {
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText(/Checked in|Couldn't complete|revoked this installation/).first()).toBeVisible({ timeout: 30_000 });
}

test("setup registers the team; the owner sees it", async ({ page, browser }) => {
  await page.goto("/setup");
  await page.getByLabel("Setup token").fill("e2e-setup-token-1234");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Ada Admin");
  await page.getByLabel("Email").fill("admin@loop.test");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create admin" }).click();
  await page.getByLabel("Team name").fill("Loop Robotics");
  await page.getByLabel("Team number (optional)").fill("4242");
  await page.getByLabel("Region (optional)").fill("Midwest");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("The registry check (required)")).toBeVisible();
  await page.getByLabel(/I.ve read the license/).check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: /Hi, Ada/ })).toBeVisible({ timeout: 60_000 });

  const owner = await ownerPage(browser);
  await owner.goto(`${REGISTRY}/teams`);
  await expect(owner.getByRole("link", { name: "Loop Robotics" })).toBeVisible();
  await expect(owner.getByRole("row", { name: /Loop Robotics/ })).toContainText("Midwest");
  await owner.goto(`${REGISTRY}/`);
  await expect(owner.getByText("Registered teams")).toBeVisible();

  // Command shows the license card as working, with what is sent.
  await page.goto("/admin/settings");
  await expect(page.getByText("Exactly what is sent")).toBeVisible();
  await expect(page.getByText("Working").first()).toBeVisible();
  await owner.context().close();
});

test("revoke shows the owner's message and a countdown in Command; restore clears it at the next heartbeat", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@loop.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  const owner = await ownerPage(browser);
  await owner.goto(`${REGISTRY}/teams`);
  await owner.getByRole("link", { name: "Loop Robotics" }).click();
  await owner.getByLabel("Message shown to their admins").fill("Please contact alex@alexradu.co about your installation.");
  await owner.getByLabel("Reason (private)").fill("duplicate of team 4242");
  await owner.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(owner.getByRole("heading", { name: /Loop Robotics.*revoked/i })).toBeVisible(); // the status badge flips (the form itself disappears)

  await checkNow(page);
  await expect(page.getByText("Action needed: this installation was revoked by the owner.")).toBeVisible();
  await expect(page.getByText(/Please contact alex@alexradu.co about your installation/).first()).toBeVisible();
  await expect(page.getByText(/becomes read-only on/)).toBeVisible(); // a countdown, not yet read-only
  await expect(page.getByText("Command is read-only.")).toHaveCount(0);
  // The private reason is never sent to the team.
  expect(await page.content()).not.toContain("duplicate of team 4242");

  await owner.getByRole("button", { name: "Restore", exact: true }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await expect(owner.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);

  await checkNow(page);
  await expect(page.getByText("Action needed: this installation was revoked by the owner.")).toHaveCount(0);
  await owner.context().close();
});

test("an owner-declared integrity failure makes Command read-only (export still works); clearing restores it", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@loop.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  const owner = await ownerPage(browser);
  await owner.goto(`${REGISTRY}/teams`);
  await owner.getByRole("link", { name: "Loop Robotics" }).click();
  await owner.getByRole("button", { name: "Mark as modified build" }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "Mark as modified" }).click();
  await expect(owner.getByText("Integrity failed").first()).toBeVisible();

  await checkNow(page);
  await expect(page.getByText("Command is read-only.")).toBeVisible();
  await expect(page.getByText(/license-check code was changed/)).toBeVisible();
  const clock = await page.request.post("/api/clock", { data: { actionId: "abcdefgh1", action: "in", kind: "open" }, headers: { origin: "http://localhost:3400" } });
  expect(clock.status()).toBe(423);
  expect((await clock.json()).error).toMatch(/read-only/i);
  expect((await page.request.get("/api/export/hours")).status()).toBe(200); // export always works
  expect((await page.request.get("/api/export/my-hours")).status()).toBe(200);

  await owner.getByRole("button", { name: "Clear integrity failure" }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "Clear" }).click();
  await expect(owner.getByText("Integrity failed")).toHaveCount(0);
  await checkNow(page);
  await expect(page.getByText("Command is read-only.")).toHaveCount(0);
  await owner.context().close();
});

test("rotating a token makes Command register again by itself; every owner action is in the activity log", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@loop.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  const owner = await ownerPage(browser);
  await owner.goto(`${REGISTRY}/teams`);
  await owner.getByRole("link", { name: "Loop Robotics" }).click();
  await owner.getByRole("button", { name: "Rotate token" }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "Rotate" }).click();
  await owner.waitForTimeout(500);

  await checkNow(page);
  await expect(page.getByText("Checked in with the license registry. All good.")).toBeVisible();

  await owner.goto(`${REGISTRY}/activity`);
  for (const action of ["instance.revoke", "instance.restore", "instance.integrity_failed", "instance.integrity_cleared", "instance.rotate_token"]) {
    await expect(owner.getByText(action, { exact: true }).first()).toBeVisible();
  }
  await owner.context().close();
});
