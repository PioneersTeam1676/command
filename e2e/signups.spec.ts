import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

  await page.getByText("Add one shift or item").click();
  const add = async (title: string, start: string, end: string, capacity: string) => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add", exact: true }) });
    await form.getByLabel("Shift name").fill(title);
    await form.getByLabel("Starts").fill(start);
    await form.getByLabel("Ends").fill(end);
    await form.getByLabel("People needed").fill(capacity);
    await form.getByRole("button", { name: "Add", exact: true }).click();
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
  await expect(member.getByText("Add one shift or item")).toHaveCount(0);

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
  await page.getByText("Add one shift or item").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add", exact: true }) });
  await form.getByLabel("Shift name").fill("Scouting lead");
  await form.getByLabel("Starts").fill("2031-03-10T14:00");
  await form.getByLabel("Ends").fill("2031-03-10T16:00");
  await form.getByLabel("People needed").fill("2");
  await form.getByLabel("Super scouts").check();
  await form.getByLabel("Open to everyone at (optional)").fill("2031-03-09T08:00");
  await form.getByRole("button", { name: "Add", exact: true }).click();
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
  await page.getByText("Add one shift or item").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add", exact: true }) });
  await form.getByLabel("Shift name").fill("Last one");
  await form.getByLabel("Starts").fill("2031-03-10T17:00");
  await form.getByLabel("Ends").fill("2031-03-10T18:00");
  await form.getByLabel("People needed").fill("1");
  await expect(form.getByLabel("Keep a waitlist")).toBeChecked();
  await form.getByRole("button", { name: "Add", exact: true }).click();
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

test("manage page: a lead places and removes people; members can't open it", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  await page.goto(eventUrl);
  await page.getByRole("link", { name: "Manage sign-ups" }).click();
  await expect(page.getByRole("heading", { name: "Manage sign-ups" })).toBeVisible();
  await expect(page.getByText(/places filled across/)).toBeVisible();

  const card = page.locator("div.rounded-\\[8px\\].border").filter({ has: page.getByRole("heading", { name: "Pit crew" }) }).first();
  await card.getByText("Add people", { exact: true }).click();
  await card.getByLabel(/Olly Outsider/).check();
  await card.getByRole("button", { name: "Add selected" }).click();
  await expect(card.getByText("Added 1 person.")).toBeVisible();
  await page.reload();
  const list = page.getByRole("list", { name: "On Pit crew" });
  await expect(list).toContainText("Olly Outsider");
  await expect(list).toContainText("placed by a lead");

  await list.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("list", { name: "On Pit crew" })).toHaveCount(0);

  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(`${eventUrl}/signups`);
  await expect(member).not.toHaveURL(/\/signups$/); // redirected away
  await expect(member.getByRole("heading", { name: "Manage sign-ups" })).toHaveCount(0);
  await mCtx.close();
});

test("accessibility: the sign-up sheet and manage page have no serious axe violations, light and dark", async ({ browser }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ colorScheme });
    const page = await ctx.newPage();
    await signIn(page, "admin@school.edu");
    const scan = async (url: string, open?: (p: Page) => Promise<void>) => {
      await page.goto(url);
      await page.waitForLoadState("load");
      await open?.(page);
      await page.waitForTimeout(400);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${colorScheme} ${url}`).toEqual([]);
    };
    await scan(eventUrl);
    await scan(eventUrl, async (p) => {
      await p.getByText("Add one shift or item").click();
      await p.getByText("Edit this shift").first().click();
    });
    await scan(`${eventUrl}/signups`);
    await scan("/admin/groups");
    await scan("/me/shifts");
    await ctx.close();
  }
});

test("my shifts: Home and calendar show them, and the private calendar link works, resets and turns off", async ({ browser }) => {
  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await signIn(member, "olly@gmail.com");

  await member.goto("/");
  await expect(member.getByRole("heading", { name: "Your shifts" })).toBeVisible();
  await expect(member.getByText("Booth").first()).toBeVisible();
  await member.goto("/calendar?view=agenda");
  await expect(member.getByText(/Your shift|\d shifts$/).first()).toBeVisible();

  await member.goto("/me/shifts");
  await expect(member.getByRole("heading", { name: "My shifts", exact: true })).toBeVisible();
  const mine = member.getByRole("list").filter({ hasText: "Booth" }).first();
  await expect(mine).toContainText("Regional");
  await expect(mine).toContainText("You're on it");

  // Make a private link and actually read it back the way a calendar app would (no cookies, no sign-in).
  await member.getByRole("button", { name: "Make my calendar link" }).click();
  const field = member.getByLabel("Your private calendar link");
  await expect(field).toBeVisible();
  const first = await field.inputValue();
  expect(first).toMatch(/\/api\/calendar\/shifts\/[\w-]{20,}\.ics$/);
  const anon = await browser.newContext();
  const ok = await anon.request.get(first);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toContain("text/calendar");
  expect(ok.headers()["x-robots-tag"]).toContain("noindex");
  const body = await ok.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:Booth (Regional)");
  expect(body).not.toContain("admin@school.edu");

  // A new link replaces the old one at once.
  await member.getByRole("button", { name: "Make a new link" }).click();
  await expect(member.getByLabel("Your private calendar link")).not.toHaveValue(first);
  const second = await member.getByLabel("Your private calendar link").inputValue();
  expect((await anon.request.get(first)).status()).toBe(404);
  expect((await anon.request.get(second)).status()).toBe(200);
  expect((await anon.request.get(second.replace(/shifts\/.{6}/, "shifts/AAAAAA"))).status()).toBe(404);

  await member.getByRole("button", { name: "Turn off" }).click();
  await expect(member.getByText("Your calendar link is turned off.")).toBeVisible();
  expect((await anon.request.get(second)).status()).toBe(404);
  await anon.close();
  await ctx.close();
});

test("things to bring, many shifts at once, copying a sheet, and the event page passes axe", async ({ page, browser }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/calendar/new");
  await page.getByLabel("Title").fill("Bake sale");
  await page.getByLabel("Starts").fill("2031-04-12T09:00");
  await page.getByLabel("Ends").fill("2031-04-12T17:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Bake sale" })).toBeVisible();
  const saleUrl = page.url();

  // A thing to bring: no times to fill in.
  await page.getByText("Add one shift or item").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add", exact: true }) });
  await form.getByText("Something to bring").click();
  await expect(form.getByLabel("Starts")).toHaveCount(0);
  await form.getByLabel("What to bring").fill("Cold drinks");
  await form.getByLabel("How many are needed").fill("2");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  const drinks = (p: import("@playwright/test").Page) => p.getByRole("listitem").filter({ hasText: "Cold drinks" }).first();
  await expect(drinks(page)).toContainText("0 of 2 claimed");

  // Many shifts at once: 9 to 5 every 2 hours = 4 shifts.
  await page.getByText("Add many shifts at once").click();
  const bulk = page.locator("form").filter({ has: page.getByRole("button", { name: "Add all the shifts" }) });
  await bulk.getByLabel("Shift name").fill("Cashier");
  await bulk.getByRole("button", { name: "Add all the shifts" }).click();
  await expect(page.getByText("Added 4 shifts.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Cashier" })).toHaveCount(4);

  // A member claims the drinks with a note, and the lead sees it.
  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  await member.goto(saleUrl);
  await expect(member.getByText("Add many shifts at once")).toHaveCount(0);
  await drinks(member).getByLabel("Note (optional)").fill("Two cases of soda");
  await drinks(member).getByRole("button", { name: "I'll bring this" }).click();
  await expect(drinks(member).getByText("You're bringing this")).toBeVisible();
  await expect(drinks(member).getByRole("button", { name: "I can't bring this" })).toBeVisible();
  await page.goto(saleUrl);
  await expect(drinks(page)).toContainText("Bringing:");
  await expect(drinks(page)).toContainText("Two cases of soda");
  const axe = await new AxeBuilder({ page: member }).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await mCtx.close();

  // Copy it all to next week's sale: same spots, nobody's name.
  await page.goto("/calendar/new");
  await page.getByLabel("Title").fill("Bake sale (next)");
  await page.getByLabel("Starts").fill("2031-04-19T09:00");
  await page.getByLabel("Ends").fill("2031-04-19T17:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Bake sale (next)" })).toBeVisible();
  await page.getByText("Copy from another event").click();
  await page.getByLabel("Copy from").selectOption({ label: "Bake sale · Apr 12" });
  await page.getByRole("button", { name: "Copy these spots here" }).click();
  await expect(page.getByText(/Copied 5 spots/)).toBeVisible();
  await expect(drinks(page)).toContainText("0 of 2 claimed");
  await expect(page.getByRole("listitem").filter({ hasText: "Cashier" })).toHaveCount(4);
});
