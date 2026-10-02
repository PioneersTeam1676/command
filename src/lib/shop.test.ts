import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("shop orders and stock", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let itemId: string;
  let sizes: Record<string, string> = {};

  const buyer = (k: string) => ({ id: u[k]!, name: k, email: `${k}@x.com` });
  const stockOf = async (label: string) => {
    const { getItem } = await import("./shop");
    return (await getItem(itemId))!.sizes.find((s) => s.label === label)!.stock;
  };

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date(), shopEnabled: true });
    for (const k of ["admin", "ann", "bob"]) u[k] = (await db.insert(users).values({ email: `${k}@x.com`, name: k, role: k === "admin" ? "admin" : "member", status: "active" }).returning({ id: users.id }))[0]!.id;
    const { saveItem } = await import("./shop");
    const r = await saveItem(u.admin!, null, {
      name: "Hoodie", description: null, priceCents: 3500, personalize: "required", personalizeLabel: "Name to print", personalizeMax: 20, active: true,
      sizes: [{ label: "M", stock: 2 }, { label: "L", stock: 1 }],
    });
    if (!r.ok) throw new Error(r.error);
    itemId = r.id;
    const { getItem } = await import("./shop");
    sizes = Object.fromEntries((await getItem(itemId))!.sizes.map((s) => [s.label, s.id]));
  });
  afterAll(async () => {
    await drop?.();
  });

  it("takes stock, snapshots lines and totals", async () => {
    const { placeOrder } = await import("./shop");
    const r = await placeOrder(buyer("ann"), [{ sizeId: sizes.M!, qty: 1, printText: "  Alex   R. " }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.totalCents).toBe(3500);
      expect(r.order.lines[0]!.printText).toBe("Alex R.");
    }
    expect(await stockOf("M")).toBe(1);
  });

  it("refuses more than is left, and bad or missing print text, saving nothing", async () => {
    const { placeOrder } = await import("./shop");
    const tooMany = await placeOrder(buyer("bob"), [{ sizeId: sizes.M!, qty: 2, printText: "Bob" }]);
    expect(tooMany.ok).toBe(false);
    const noText = await placeOrder(buyer("bob"), [{ sizeId: sizes.L!, qty: 1, printText: "" }]);
    expect(noText.ok).toBe(false);
    const bad = await placeOrder(buyer("bob"), [{ sizeId: sizes.L!, qty: 1, printText: "<script>" }]);
    expect(bad.ok).toBe(false);
    expect(await stockOf("M")).toBe(1);
    expect(await stockOf("L")).toBe(1);
  });

  it("never sells the last one twice under a race", async () => {
    const { placeOrder } = await import("./shop");
    const results = await Promise.all([
      placeOrder(buyer("ann"), [{ sizeId: sizes.L!, qty: 1, printText: "Ann" }]),
      placeOrder(buyer("bob"), [{ sizeId: sizes.L!, qty: 1, printText: "Bob" }]),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await stockOf("L")).toBe(0);
  });

  it("cancelling puts stock back; buyers only cancel their own pending orders", async () => {
    const { allOrders, cancelOrder, setOrderStatus } = await import("./shop");
    const [order] = (await allOrders("pending")).filter((o) => o.buyerName === "ann" && o.lines[0]!.sizeLabel === "L");
    expect((await cancelOrder({ id: u.bob!, isAdmin: false }, order!.id)).ok).toBe(false);
    expect((await setOrderStatus(u.admin!, order!.id, "paid")).ok).toBe(true);
    expect((await cancelOrder({ id: u.ann!, isAdmin: false }, order!.id)).ok).toBe(false); // paid: ask an admin
    expect((await cancelOrder({ id: u.admin!, isAdmin: true }, order!.id)).ok).toBe(true);
    expect(await stockOf("L")).toBe(1);
    expect((await setOrderStatus(u.admin!, order!.id, "delivered")).ok).toBe(false);
    expect((await cancelOrder({ id: u.admin!, isAdmin: true }, order!.id)).ok).toBe(false); // can't restock twice
    expect(await stockOf("L")).toBe(1);
  });

  it("closed shop takes no orders", async () => {
    const { placeOrder } = await import("./shop");
    const { db } = await import("@/db");
    const { teamSettings } = await import("@/db/schema");
    await db.update(teamSettings).set({ shopClosesAt: new Date(Date.now() - 1000) });
    expect((await placeOrder(buyer("bob"), [{ sizeId: sizes.M!, qty: 1, printText: "Bob" }])).ok).toBe(false);
    await db.update(teamSettings).set({ shopClosesAt: null });
  });

  it("editing sizes keeps ids and removes dropped ones", async () => {
    const { saveItem, getItem } = await import("./shop");
    const item = (await getItem(itemId))!;
    const m = item.sizes.find((s) => s.label === "M")!;
    const r = await saveItem(u.admin!, itemId, { ...item, sizes: [{ id: m.id, label: "XL", stock: 9 }, { label: "S", stock: 3 }] });
    expect(r.ok).toBe(true);
    const after = (await getItem(itemId))!.sizes;
    expect(after.map((s) => s.label).sort()).toEqual(["S", "XL"]);
    expect(after.find((s) => s.label === "XL")!.id).toBe(m.id);
    expect((await saveItem(u.admin!, itemId, { ...item, sizes: [{ label: "A", stock: 1 }, { label: "a", stock: 1 }] })).ok).toBe(false);
  });

  it("deleting an item removes its sizes but preserves orders and allows cancellation", async () => {
    const { allOrders, cancelOrder, deleteItem, getItem, listAllItems, listStoreItems, placeOrder } = await import("./shop");
    const { db } = await import("@/db");
    const { shopItemSizes } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const before = await allOrders();
    const sizeId = (await getItem(itemId))!.sizes[0]!.id;

    expect((await deleteItem(u.admin!, itemId)).ok).toBe(true);
    expect(await getItem(itemId)).toBeUndefined();
    expect(await listAllItems()).toEqual([]);
    expect(await listStoreItems()).toEqual([]);
    expect(await db.select().from(shopItemSizes).where(eq(shopItemSizes.itemId, itemId))).toEqual([]);
    expect(await allOrders()).toEqual(before.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l, itemId: null, sizeId: null })) })));
    expect((await placeOrder(buyer("ann"), [{ sizeId, qty: 1, printText: "Ann" }])).ok).toBe(false);
    const pending = before.find((o) => o.status === "pending")!;
    expect((await cancelOrder({ id: u.admin!, isAdmin: true }, pending.id)).ok).toBe(true);
    expect((await deleteItem(u.admin!, itemId)).ok).toBe(false);
  });
});
