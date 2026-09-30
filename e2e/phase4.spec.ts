import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const ORIGIN = "http://localhost:3100";

test("manifest, icons and service worker are served for the team", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  expect(m.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await m.json();
  expect(manifest).toMatchObject({ name: "Test Robotics", display: "standalone", start_url: "/", scope: "/" });
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(["any", "any", "maskable"]);

  for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-touch.png", 180]] as const) {
    const r = await request.get(`/icons/${name}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toBe("image/png");
    const buf = await r.body();
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(size); // PNG width
  }
  expect((await request.get("/icons/evil.png")).status()).toBe(404);

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect(await sw.text()).toContain("addEventListener(\"push\"");
});

test("members without push see the banner; subscribing removes it; admins see status counts", async ({ page, browser }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toBeVisible();

  // Register a (fake) device through the same API the browser uses.
  const bad = await page.request.post("/api/push/subscribe", { data: { endpoint: "http://insecure.example/x", keys: { p256dh: "x".repeat(20), auth: "y".repeat(20) } }, headers: { origin: ORIGIN } });
  expect(bad.status()).toBe(400);
  const noOrigin = await page.request.post("/api/push/subscribe", { data: { endpoint: "https://push.example/olly", keys: { p256dh: "x".repeat(20), auth: "y".repeat(20) } } });
  expect(noOrigin.status()).toBe(403);
  const ok = await page.request.post("/api/push/subscribe", { data: { endpoint: "https://push.example/olly", keys: { p256dh: "x".repeat(20), auth: "y".repeat(20) } }, headers: { origin: ORIGIN } });
  expect(ok.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toHaveCount(0);

  const aCtx = await browser.newContext();
  const admin = await aCtx.newPage();
  await signIn(admin, "admin@school.edu");
  await admin.goto("/admin/notifications");
  await expect(admin.getByText("Olly Outsider")).toBeVisible();
  await expect(admin.locator("dt", { hasText: "Active" }).locator("xpath=following-sibling::dd")).toHaveText("1");
  await admin.getByRole("link", { name: "Not enabled" }).click();
  await expect(admin.getByText("Olly Outsider")).toHaveCount(0);
  await expect(admin.getByText("Ada Admin")).toBeVisible();
  await aCtx.close();
});

test("notification preferences persist", async ({ page }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/me/notifications");
  const sw = page.getByRole("switch", { name: "Event reminder" });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeEnabled(); // optimistic state appears before the save finishes
  await page.reload();
  await expect(page.getByRole("switch", { name: "Event reminder" })).not.toBeChecked();
  // Admin-only types are not offered to members.
  await expect(page.getByRole("switch", { name: "New join requests" })).toHaveCount(0);
});

test("the service worker serves recent pages offline and the offline page for unknown ones", async ({ page, context }) => {
  await signIn(page, "olly@gmail.com");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Visit again under the worker's control so the page is cached, and warm the calendar too.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /, Olly!$/ })).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /, Olly!$/ })).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await page.goto("/admin/people").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
