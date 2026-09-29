import { expect, test } from "@playwright/test";
import { PASSWORD, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("who's here, force clock-out, roster and the member page", async ({ page }) => {
  await signIn(page, "admin@school.edu");
  // Ada clocked in offline in phase 3, so she is still clocked in.
  await page.goto("/admin/here");
  await expect(page.getByText("Build season clock-in").first()).toBeVisible();
  await page.getByRole("button", { name: "Clock out" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText("Nobody is clocked in")).toBeVisible();

  await page.goto("/admin/roster");
  await expect(page.getByRole("link", { name: /Olly Outsider/ })).toBeVisible();
  await page.getByRole("link", { name: /Olly Outsider/ }).click();
  await expect(page.getByRole("heading", { name: "Olly Outsider" })).toBeVisible();
  await expect(page.getByText("Build season clock-in").first()).toBeVisible();
});

test("CSV exports: admin-only, spreadsheet-safe, and logged", async ({ page, browser, request }) => {
  // A member whose name tries formula injection.
  const evil = await browser.newContext();
  const e = await evil.newPage();
  await e.goto("/signup");
  await e.getByLabel("Full name").fill("=HYPERLINK(\"http://evil.example\",\"click\")");
  await e.getByLabel("Email").fill("evil@gmail.com");
  await e.getByLabel("Password").fill(PASSWORD);
  await e.getByRole("button", { name: "Create account" }).click();
  await expect(e.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await evil.close();

  await signIn(page, "admin@school.edu");
  await page.goto("/admin/review");
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();

  const res = await page.request.get("/api/export/hours");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const csv = await res.text();
  expect(csv.startsWith("﻿Name,Email,Role,Season,Hours")).toBe(true);
  expect(csv).toContain("Ada Admin");
  expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`); // neutralised
  expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);

  for (const kind of ["attendance", "rsvps", "audit"]) {
    const r = await page.request.get(`/api/export/${kind}`);
    expect(r.status(), kind).toBe(200);
  }

  // Not signed in: no access. Member: own hours only.
  expect((await request.get("/api/export/hours")).status()).toBe(401);
  const mCtx = await browser.newContext();
  const member = await mCtx.newPage();
  await signIn(member, "olly@gmail.com");
  expect((await member.request.get("/api/export/hours")).status()).toBe(403);
  expect((await member.request.get("/api/export/audit")).status()).toBe(403);
  const mine = await member.request.get("/api/export/my-hours");
  expect(mine.status()).toBe(200);
  expect(await mine.text()).toContain("Build season clock-in");
  await mCtx.close();

  // The downloads themselves were logged.
  await page.goto("/admin/audit?action=export.");
  await expect(page.getByText("export.hours").first()).toBeVisible();
});

test("settings changes are saved, validated and audited", async ({ page }) => {
  await signIn(page, "admin@school.edu");
  await page.goto("/admin/settings");
  await page.getByLabel("Region (optional)").first().fill("Northeast");
  await page.getByRole("button", { name: "Save team settings" }).click();
  await expect(page.getByText("Saved.").first()).toBeVisible();

  // Reminder order is enforced with a plain-language message.
  await page.getByLabel("Clock-in reminder").fill("21:30");
  await page.getByRole("button", { name: "Save reminder times" }).click();
  await expect(page.getByText(/has to come before/).first()).toBeVisible();

  await page.goto("/admin/audit?action=settings.");
  await expect(page.getByText("settings.team").first()).toBeVisible();
  await page.getByText("Details").first().click();
  await expect(page.getByText("Northeast").first()).toBeVisible();
});
