import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const ICS = "http://127.0.0.1:3199";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const vevent = (uid: string, start: Date, summary: string, extra = "") =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:${stamp(start)}\r\nDTEND:${stamp(new Date(start.getTime() + 2 * 3_600_000))}\r\nSUMMARY:${summary}\r\n${extra}END:VEVENT\r\n`;
const calendar = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//e2e//EN\r\n${events.join("")}END:VCALENDAR\r\n`;
const soon = (days: number) => new Date(Date.now() + days * 86_400_000);
const publish = (request: import("@playwright/test").APIRequestContext, text: string) => request.post(`${ICS}/set`, { data: text });

test("ICS mode imports, updates and cancels events without duplicating, and imported events stay read-only", async ({ page, request }) => {
  await publish(request, calendar(vevent("gcal-a", soon(3), "Robot Demo"), vevent("gcal-b", soon(4), "Sponsor Visit")));
  await signIn(page, "admin@school.edu");

  await page.goto("/admin/settings");
  await expect(page.getByText("Import (ICS)")).toBeVisible();
  // A public-looking scheme is enforced; garbage is refused with a plain message.
  await page.getByLabel("Secret address in iCal format").fill("file:///etc/passwd");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(/must start with https/i).first()).toBeVisible();

  await page.getByLabel("Secret address in iCal format").fill(`${ICS}/cal.ics`);
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(/Saved\. Use “Sync now”/)).toBeVisible();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText(/We can read 2 events/)).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/2 events: 2 new, 0 changed, 0 removed/)).toBeVisible();

  await page.goto("/calendar?view=agenda");
  await expect(page.getByRole("link", { name: /Robot Demo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sponsor Visit/ })).toBeVisible();

  // Imported events are read-only, except how members check in.
  await page.getByRole("link", { name: /Robot Demo/ }).click();
  await expect(page.getByText("From Google Calendar")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByText(/imported from Google Calendar/)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);
  await page.getByLabel("How do members check in?").selectOption("code");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Robot Demo" })).toBeVisible();
  await expect(page.getByText("Check-in: rotating code")).toBeVisible();

  // Syncing again changes nothing (no duplicates).
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/2 events: 0 new, 0 changed, 0 removed/)).toBeVisible();

  // The source changes: rename one, delete the other, add a new one.
  await publish(request, calendar(vevent("gcal-a", soon(3), "Robot Demo (updated)"), vevent("gcal-c", soon(5), "Scrimmage")));
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/3 events|2 events: 1 new, 1 changed, 1 removed/)).toBeVisible();
  await page.goto("/calendar?view=agenda");
  await expect(page.getByRole("link", { name: /Robot Demo \(updated\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Scrimmage/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sponsor Visit/ })).toContainText("Cancelled");
  // The check-in choice set in Command survived the re-import.
  await page.getByRole("link", { name: /Robot Demo \(updated\)/ }).click();
  await expect(page.getByText("Check-in: rotating code")).toBeVisible();

  // Members can RSVP to imported events like any other.
  await page.getByRole("button", { name: "Going" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("a broken calendar address gives a readable error, not a crash", async ({ page, request }) => {
  await publish(request, "<html>login page</html>");
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText(/didn't return a calendar/)).toBeVisible();
  await publish(request, calendar());
});
