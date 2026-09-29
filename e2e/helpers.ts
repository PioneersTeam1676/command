import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery staple";

/** Submit the login form without waiting for the outcome. */
export async function attemptSignIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await attemptSignIn(page, email, password);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function signOutViaMe(page: Page) {
  await page.goto("/me");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}
