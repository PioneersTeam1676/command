import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const PASSWORD = "correct horse battery staple";

/** Submit the login form without waiting for the outcome. */
export async function attemptSignIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Every e2e login comes from localhost, so the whole suite shares one per-IP login budget (30 per 10 minutes)
 * that a successful login doesn't refill. Clear just that counter; the per-account lockout is left alone
 * so the specs that test it still see it.
 */
async function resetIpLoginBudget() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://command:command@localhost:54329/command");
  url.pathname = "/cmd_e2e";
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    await pool.query("delete from rate_limits where key like 'login:ip:%'");
  } finally {
    await pool.end();
  }
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await resetIpLoginBudget();
  await attemptSignIn(page, email, password);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function signOutViaMe(page: Page) {
  await page.goto("/me");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}
