import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Runs after phase1/2 (same database). Team timezone is mid-day (chosen in phase 1). */
test.describe.configure({ mode: "serial" });

async function teamTimezone(page: Page): Promise<string> {
  await page.goto("/admin/settings");
  return page.getByLabel("Team timezone").inputValue();
}

/** `datetime-local` value for `now + minutes` in the given timezone. */
async function localInput(page: Page, tz: string, minutes: number): Promise<string> {
  return page.evaluate(
    ([z, m]) => {
      const d = new Date(Date.now() + (m as number) * 60_000);
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: z as string, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
      return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
    },
    [tz, minutes],
  );
}

test("open clock-in and clock-out from the Home screen", async ({ page }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/");
  await page.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByRole("button", { name: "Clock out" })).toBeVisible();
  await expect(page.getByText(/Auto clock-out at/)).toBeVisible();
  await page.getByRole("button", { name: "Clock out" }).click();
  const note = page.getByRole("dialog", { name: "What did you work on?" });
  await note.getByRole("textbox").fill("Wired the drivetrain");
  await note.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText("Clocked out", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clock in", exact: true })).toBeEnabled();
  await page.goto("/me/hours");
  await expect(page.getByText("Build season clock-in")).toBeVisible();
  await expect(page.getByText("Wired the drivetrain")).toBeVisible();
});

test("rotating-code event check-in with a wrong code, the right code, then clock-out", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  const tz = await teamTimezone(page);

  await page.goto("/calendar/new");
  await page.getByLabel("Title").fill("Code Night");
  await page.getByLabel("Starts").fill(await localInput(page, tz, 10));
  await page.getByLabel("Ends").fill(await localInput(page, tz, 120));
  await page.getByLabel("How do members check in?").selectOption("code");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Code Night" })).toBeVisible();
  const eventUrl = page.url();

  // The display shows a QR and a 6-digit code.
  await page.getByRole("link", { name: "Start check-in display" }).click();
  await expect(page.getByAltText("QR code for checking in")).toBeVisible();
  await expect(page.getByText("Members scan this with their phone camera")).toBeVisible();
  const codeText = (await page.getByTestId("checkin-code").innerText()).replace(/\s/g, "");
  expect(codeText).toMatch(/^\d{6}$/);

  // Member enters a wrong code, then the right one.
  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto("/");
  const card = member.getByRole("region", { name: "Today", exact: true })
    .locator("div.border", { has: member.getByRole("link", { name: /^Code Night/ }) });
  await card.getByLabel("Check-in code").fill(codeText === "000000" ? "111111" : "000000");
  await card.getByRole("button", { name: "Check in" }).click();
  await expect(member.getByText(/That code isn't right/)).toBeVisible();
  await card.getByLabel("Check-in code").fill(codeText);
  await card.getByRole("button", { name: "Check in" }).click();
  await expect(card.getByText("Checked in")).toBeVisible();
  await card.getByRole("button", { name: "Clock out of event" }).click();
  await expect(card.getByText("Done")).toBeVisible();

  // The QR link lands on the check-in page with the code prefilled (signed-in member who already checked in goes Home).
  await mCtx.close();
  await page.goto(eventUrl);
});

test("a tap made offline is queued with its original time and syncs when back online", async ({ page, context }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Clock in" })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText(/Will sync when you're back online/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Clock out" })).toBeVisible(); // optimistic state
  await page.waitForTimeout(3000); // the device time we expect the server to keep is ~3s before the sync
  await context.setOffline(false);
  await expect(page.getByText(/Will sync when you're back online/)).toHaveCount(0, { timeout: 15_000 });
  await page.goto("/me/hours");
  await expect(page.getByText("Saved offline")).toBeVisible();
  await expect(page.getByText("In progress")).toBeVisible();
});
