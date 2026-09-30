import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Runs after the phase specs (same database): relies on admin@school.edu and olly@gmail.com existing. */
test.describe.configure({ mode: "serial" });

let eventUrl = "";

test("sign-up sheet: a lead builds shifts, a member claims, hits the overlap and full rules, and leaves", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/calendar/new");
  await page.getByLabel("Title").fill("Regional");
  await page.getByLabel("Starts").fill("2031-03-10T08:00");
  await page.getByLabel("Ends").fill("2031-03-10T18:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Regional" })).toBeVisible();
  eventUrl = page.url();

  await page.getByRole("button", { name: "Add a sign-up sheet" }).click();
  await page.getByText("Add a shift").click();
  const add = async (title: string, start: string, end: string, capacity: string) => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add shift" }) });
    await form.getByLabel("Shift name").fill(title);
    await form.getByLabel("Starts").fill(start);
    await form.getByLabel("Ends").fill(end);
    await form.getByLabel("People needed").fill(capacity);
    await form.getByRole("button", { name: "Add shift" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title }).first()).toBeVisible();
  };
  await add("Pit crew", "2031-03-10T09:00", "2031-03-10T11:00", "1");
  await add("Scouting", "2031-03-10T10:00", "2031-03-10T12:00", "2");
  await add("Booth", "2031-03-10T11:00", "2031-03-10T13:00", "2");

  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(eventUrl);
  const shift = (name: string) => member.getByRole("listitem").filter({ hasText: name }).first();

  await shift("Pit crew").getByRole("button", { name: "Sign up" }).click();
  await expect(shift("Pit crew").getByText("You're signed up")).toBeVisible();
  await expect(shift("Pit crew").getByText(/1 of 1/)).toBeVisible();

  // Overlaps Pit crew (10:00-12:00 vs 9:00-11:00): refused with the reason.
  await shift("Scouting").getByRole("button", { name: "Sign up" }).click();
  await expect(shift("Scouting").getByRole("alert")).toContainText("overlaps");

  // Back-to-back is fine (Pit crew ends 11:00, Booth starts 11:00).
  await shift("Booth").getByRole("button", { name: "Sign up" }).click();
  await expect(shift("Booth").getByText("You're signed up")).toBeVisible();

  // Members can't see the lead controls or call lead actions.
  await expect(member.getByRole("button", { name: "Cancel shift" })).toHaveCount(0);
  await expect(member.getByText("Add a shift")).toHaveCount(0);

  // The lead sees who signed up.
  await page.goto(eventUrl);
  await expect(page.getByRole("listitem").filter({ hasText: "Pit crew" }).first()).toContainText("Signed up:");

  await shift("Pit crew").getByRole("button", { name: "Leave this shift" }).click();
  await expect(shift("Pit crew").getByRole("button", { name: "Sign up" })).toBeVisible();
  await expect(shift("Pit crew").getByText(/0 of 1/)).toBeVisible();

  // Closing the sheet stops new claims.
  await page.getByRole("button", { name: "Close sign-ups" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await member.reload();
  await expect(member.getByRole("button", { name: "Sign up" })).toHaveCount(0);
  await mCtx.close();
});

test("groups: an admin makes a group, reserves a shift with early access, and each person sees the right thing", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/groups");
  await page.getByLabel("Name").fill("Super scouts");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("Group created")).toBeVisible();
  await page.getByText("Add people", { exact: true }).click();
  await page.getByLabel(/Olly Outsider/).check();
  await page.getByRole("button", { name: "Add selected" }).click();
  await expect(page.getByText("1 person", { exact: true })).toBeVisible();

  // Team-wide names are unique, whatever the case.
  await page.getByLabel("Name").first().fill("super SCOUTS");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("There's already a group with that name.").first()).toBeVisible();

  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Reopen sign-ups" }).click();
  await page.getByText("Add a shift").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add shift" }) });
  await form.getByLabel("Shift name").fill("Scouting lead");
  await form.getByLabel("Starts").fill("2031-03-10T14:00");
  await form.getByLabel("Ends").fill("2031-03-10T16:00");
  await form.getByLabel("People needed").fill("2");
  await form.getByLabel("Super scouts").check();
  await form.getByLabel("Open to everyone at (optional)").fill("2031-03-09T08:00");
  await form.getByRole("button", { name: "Add shift" }).click();
  const item = (p: import("@playwright/test").Page) => p.getByRole("listitem").filter({ hasText: "Scouting lead" }).first();
  await expect(item(page)).toBeVisible();
  // The admin isn't in the group, so they see who has first pick and no sign-up button.
  await expect(item(page)).toContainText("Super scouts has first pick");
  await expect(item(page).getByRole("button", { name: "Sign up" })).toHaveCount(0);

  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(eventUrl);
  await expect(item(member)).toContainText("Super scouts");
  await item(member).getByRole("button", { name: "Sign up" }).click();
  await expect(item(member).getByText("You're signed up")).toBeVisible();
  await mCtx.close();

  // A group can't be deleted while a shift is still reserved for it.
  await page.goto("/admin/groups");
  await page.getByRole("button", { name: "Delete group" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete group" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "still set on 1 shift" })).toBeVisible();
});

test("waitlist: a full shift queues the next person, and leaving promotes them", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  await page.goto(eventUrl);
  await page.getByText("Add a shift").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add shift" }) });
  await form.getByLabel("Shift name").fill("Last one");
  await form.getByLabel("Starts").fill("2031-03-10T17:00");
  await form.getByLabel("Ends").fill("2031-03-10T18:00");
  await form.getByLabel("People needed").fill("1");
  await expect(form.getByLabel("Keep a waitlist")).toBeChecked();
  await form.getByRole("button", { name: "Add shift" }).click();
  const item = (p: import("@playwright/test").Page) => p.getByRole("listitem").filter({ hasText: "Last one" }).first();
  await expect(item(page)).toBeVisible();

  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(eventUrl);
  await item(member).getByRole("button", { name: "Sign up" }).click();
  await expect(item(member).getByText("You're signed up")).toBeVisible();

  await page.reload();
  await expect(item(page)).toContainText("1 of 1 · Full");
  await item(page).getByRole("button", { name: "Join the waitlist" }).click();
  await expect(item(page).getByText("On the waitlist · number 1")).toBeVisible();
  await page.reload();
  await expect(item(page).getByText("On the waitlist · number 1")).toBeVisible();

  await member.reload();
  await item(member).getByRole("button", { name: "Leave this shift" }).click();
  // Once the leave has landed the admin holds the place, so the member is offered the waitlist.
  await expect(item(member).getByRole("button", { name: "Join the waitlist" })).toBeVisible();

  await page.reload();
  await expect(item(page).getByText("You're signed up")).toBeVisible();
  await expect(item(page)).not.toContainText("waitlist ·");
  await mCtx.close();
});
