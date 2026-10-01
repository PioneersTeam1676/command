import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { shopItems, shopItemSizes, shopOrderLines, shopOrders, users, type ShopOrderStatus, type ShopPersonalizeMode } from "@/db/schema";
import { audit } from "@/lib/audit";
import { MAX_ORDER_LINES, isShopOpen, normalizePrintText, orderTotal } from "@/lib/shop-rules";
import { getSettings, readSettings } from "@/lib/settings";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type ShopItemRow = typeof shopItems.$inferSelect;
export type ShopSizeRow = typeof shopItemSizes.$inferSelect;
export type ShopItemWithSizes = ShopItemRow & { sizes: ShopSizeRow[] };

async function withSizes(items: ShopItemRow[]): Promise<ShopItemWithSizes[]> {
  if (items.length === 0) return [];
  const sizes = await db.select().from(shopItemSizes).where(inArray(shopItemSizes.itemId, items.map((i) => i.id))).orderBy(asc(shopItemSizes.sortOrder), asc(shopItemSizes.label));
  return items.map((i) => ({ ...i, sizes: sizes.filter((s) => s.itemId === i.id) }));
}

/** What buyers see: visible items only. */
export async function listStoreItems(): Promise<ShopItemWithSizes[]> {
  return withSizes(await db.select().from(shopItems).where(eq(shopItems.active, true)).orderBy(asc(shopItems.sortOrder), asc(shopItems.name)));
}

/** What admins manage: everything, hidden items too. */
export async function listAllItems(): Promise<ShopItemWithSizes[]> {
  return withSizes(await db.select().from(shopItems).orderBy(desc(shopItems.active), asc(shopItems.sortOrder), asc(shopItems.name)));
}

export async function getItem(id: string): Promise<ShopItemWithSizes | undefined> {
  return (await withSizes(await db.select().from(shopItems).where(eq(shopItems.id, id))))[0];
}

/** Whether to show Shop in the navigation (cheap: uses the per-request settings cache). */
export async function shopIsOpen(): Promise<boolean> {
  return isShopOpen(await getSettings());
}

export type ItemInput = {
  name: string;
  description: string | null;
  priceCents: number;
  personalize: ShopPersonalizeMode;
  personalizeLabel: string;
  personalizeMax: number;
  active: boolean;
  /** Existing sizes keep their id so open orders stay linked. Sizes left out are removed. */
  sizes: { id?: string; label: string; stock: number }[];
};

export function validateSizes(sizes: ItemInput["sizes"]): string | null {
  if (sizes.length === 0) return "Add at least one size (use “One size” if it has no sizes).";
  if (sizes.length > 30) return "That's too many sizes.";
  const seen = new Set<string>();
  for (const s of sizes) {
    const key = s.label.trim().toLowerCase();
    if (!key) return "Every size needs a name.";
    if (seen.has(key)) return `“${s.label}” is listed twice.`;
    seen.add(key);
    if (!Number.isInteger(s.stock) || s.stock < 0 || s.stock > 100000) return "Stock must be a whole number, 0 or more.";
  }
  return null;
}

export async function saveItem(actorId: string, id: string | null, input: ItemInput, photoPath?: string | null): Promise<Result<{ id: string }>> {
  const bad = validateSizes(input.sizes);
  if (bad) return { ok: false, error: bad };
  return db.transaction(async (tx) => {
    const values = {
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      personalize: input.personalize,
      personalizeLabel: input.personalizeLabel,
      personalizeMax: input.personalizeMax,
      active: input.active,
      ...(photoPath !== undefined ? { photoPath } : {}),
    };
    let itemId = id;
    if (id) {
      const updated = await tx.update(shopItems).set(values).where(eq(shopItems.id, id)).returning({ id: shopItems.id });
      if (updated.length === 0) return { ok: false as const, error: "That item doesn't exist." };
    } else {
      const [row] = await tx.insert(shopItems).values(values).returning({ id: shopItems.id });
      itemId = row!.id;
    }
    const existing = await tx.select().from(shopItemSizes).where(eq(shopItemSizes.itemId, itemId!));
    const keep = new Set(input.sizes.map((s) => s.id).filter(Boolean));
    const drop = existing.filter((s) => !keep.has(s.id)).map((s) => s.id);
    if (drop.length) await tx.delete(shopItemSizes).where(inArray(shopItemSizes.id, drop));
    // Rename through a temporary label first so swapping two names in one save can't hit the unique index.
    for (const s of input.sizes) {
      if (s.id && existing.some((e) => e.id === s.id)) await tx.update(shopItemSizes).set({ label: `~${s.id}` }).where(eq(shopItemSizes.id, s.id));
    }
    for (const [i, s] of input.sizes.entries()) {
      const label = s.label.trim();
      if (s.id && existing.some((e) => e.id === s.id)) await tx.update(shopItemSizes).set({ label, stock: s.stock, sortOrder: i }).where(eq(shopItemSizes.id, s.id));
      else await tx.insert(shopItemSizes).values({ itemId: itemId!, label, stock: s.stock, sortOrder: i });
    }
    await audit({ actorId, action: id ? "shop.item_update" : "shop.item_create", targetType: "shop_item", targetId: itemId!, after: { name: input.name, priceCents: input.priceCents, sizes: input.sizes.map((s) => `${s.label}:${s.stock}`) } }, tx);
    return { ok: true as const, id: itemId! };
  });
}

export async function deleteItem(actorId: string, id: string): Promise<Result<{ photoPath: string | null }>> {
  const item = await getItem(id);
  if (!item) return { ok: false, error: "That item doesn't exist." };
  await db.transaction(async (tx) => {
    await tx.delete(shopItems).where(eq(shopItems.id, id));
    await audit({ actorId, action: "shop.item_delete", targetType: "shop_item", targetId: id, before: { name: item.name } }, tx);
  });
  return { ok: true, photoPath: item.photoPath };
}

export type OrderRequestLine = { sizeId: string; qty: number; printText: string };

export type PlacedOrder = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  payByAt: Date | null;
  lines: { itemName: string; sizeLabel: string; qty: number; unitPriceCents: number; printText: string | null }[];
};

/**
 * Places one order. Size rows are locked and counted in the same transaction, so the last hoodie
 * can't be sold twice. Nothing is saved unless every line fits.
 */
export async function placeOrder(buyer: { id: string; name: string; email: string }, requested: OrderRequestLine[], now = new Date()): Promise<Result<{ order: PlacedOrder }>> {
  const settings = await readSettings();
  if (!isShopOpen(settings, now)) return { ok: false, error: "The shop is closed." };
  if (requested.length === 0) return { ok: false, error: "Your cart is empty." };
  if (requested.length > MAX_ORDER_LINES) return { ok: false, error: `An order can have at most ${MAX_ORDER_LINES} items.` };
  if (requested.some((l) => !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 20)) return { ok: false, error: "Quantity must be between 1 and 20." };

  return db.transaction(async (tx) => {
    const sizeIds = [...new Set(requested.map((l) => l.sizeId))];
    const rows = await tx
      .select({ size: shopItemSizes, item: shopItems })
      .from(shopItemSizes)
      .innerJoin(shopItems, eq(shopItems.id, shopItemSizes.itemId))
      .where(inArray(shopItemSizes.id, sizeIds))
      .orderBy(asc(shopItemSizes.id))
      .for("update", { of: shopItemSizes });
    const byId = new Map(rows.map((r) => [r.size.id, r]));

    const want = new Map<string, number>();
    const out: (PlacedOrder["lines"][number] & { sizeId: string; itemId: string })[] = [];
    for (const l of requested) {
      const r = byId.get(l.sizeId);
      if (!r || !r.item.active) return { ok: false as const, error: "One of those items is no longer available." };
      const text = normalizePrintText(l.printText, { mode: r.item.personalize, max: r.item.personalizeMax });
      if (!text.ok) return { ok: false as const, error: `${r.item.name}: ${text.error}` };
      want.set(l.sizeId, (want.get(l.sizeId) ?? 0) + l.qty);
      out.push({ sizeId: l.sizeId, itemId: r.item.id, itemName: r.item.name, sizeLabel: r.size.label, qty: l.qty, unitPriceCents: r.item.priceCents, printText: text.value });
    }
    for (const [sizeId, qty] of want) {
      const r = byId.get(sizeId)!;
      if (r.size.stock < qty) {
        return { ok: false as const, error: r.size.stock === 0 ? `${r.item.name} (${r.size.label}) just sold out.` : `Only ${r.size.stock} left of ${r.item.name} (${r.size.label}).` };
      }
    }
    for (const [sizeId, qty] of want) await tx.update(shopItemSizes).set({ stock: sql`${shopItemSizes.stock} - ${qty}` }).where(eq(shopItemSizes.id, sizeId));

    const total = orderTotal(out);
    const [order] = await tx
      .insert(shopOrders)
      .values({ userId: buyer.id, buyerName: buyer.name, buyerEmail: buyer.email, totalCents: total, payByAt: settings.shopClosesAt })
      .returning();
    await tx.insert(shopOrderLines).values(out.map((l) => ({ orderId: order!.id, itemId: l.itemId, sizeId: l.sizeId, itemName: l.itemName, sizeLabel: l.sizeLabel, unitPriceCents: l.unitPriceCents, qty: l.qty, printText: l.printText })));
    return {
      ok: true as const,
      order: { id: order!.id, buyerName: buyer.name, buyerEmail: buyer.email, totalCents: total, payByAt: order!.payByAt, lines: out.map(({ itemName, sizeLabel, qty, unitPriceCents, printText }) => ({ itemName, sizeLabel, qty, unitPriceCents, printText })) },
    };
  });
}

export type OrderWithLines = typeof shopOrders.$inferSelect & { lines: (typeof shopOrderLines.$inferSelect)[] };

async function withLines(orders: (typeof shopOrders.$inferSelect)[]): Promise<OrderWithLines[]> {
  if (orders.length === 0) return [];
  const lines = await db.select().from(shopOrderLines).where(inArray(shopOrderLines.orderId, orders.map((o) => o.id))).orderBy(asc(shopOrderLines.itemName), asc(shopOrderLines.sizeLabel));
  return orders.map((o) => ({ ...o, lines: lines.filter((l) => l.orderId === o.id) }));
}

export async function myOrders(userId: string): Promise<OrderWithLines[]> {
  return withLines(await db.select().from(shopOrders).where(eq(shopOrders.userId, userId)).orderBy(desc(shopOrders.createdAt)));
}

export async function allOrders(status?: ShopOrderStatus): Promise<OrderWithLines[]> {
  const q = db.select().from(shopOrders);
  return withLines(await (status ? q.where(eq(shopOrders.status, status)) : q).orderBy(desc(shopOrders.createdAt)));
}

export async function orderCounts(): Promise<Record<ShopOrderStatus, number>> {
  const rows = await db.select({ status: shopOrders.status, n: sql<number>`count(*)::int` }).from(shopOrders).groupBy(shopOrders.status);
  const base: Record<ShopOrderStatus, number> = { pending: 0, paid: 0, delivered: 0, cancelled: 0 };
  for (const r of rows) base[r.status] = r.n;
  return base;
}

/** Cancels an order and puts its items back in stock. Buyers can cancel their own order until it is paid; admins any time. */
export async function cancelOrder(actor: { id: string; isAdmin: boolean }, orderId: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(shopOrders).where(eq(shopOrders.id, orderId)).for("update");
    if (!o) return { ok: false as const, error: "That order doesn't exist." };
    if (!actor.isAdmin && (o.userId !== actor.id || o.status !== "pending")) return { ok: false as const, error: "Ask an admin to cancel this order." };
    if (o.status === "cancelled") return { ok: false as const, error: "That order is already cancelled." };
    const lines = await tx.select().from(shopOrderLines).where(eq(shopOrderLines.orderId, orderId));
    for (const l of lines) if (l.sizeId) await tx.update(shopItemSizes).set({ stock: sql`${shopItemSizes.stock} + ${l.qty}` }).where(eq(shopItemSizes.id, l.sizeId));
    await tx.update(shopOrders).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(shopOrders.id, orderId));
    await audit({ actorId: actor.id, action: "shop.order_cancel", targetType: "shop_order", targetId: orderId, before: { status: o.status } }, tx);
    return { ok: true as const };
  });
}

/** Admin moves an order along: pending -> paid -> delivered (or back one step if it was a mistake). */
export async function setOrderStatus(actorId: string, orderId: string, status: "pending" | "paid" | "delivered"): Promise<Result> {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(shopOrders).where(eq(shopOrders.id, orderId)).for("update");
    if (!o) return { ok: false as const, error: "That order doesn't exist." };
    if (o.status === "cancelled") return { ok: false as const, error: "Cancelled orders can't be changed." };
    const now = new Date();
    await tx
      .update(shopOrders)
      .set({ status, paidAt: status === "pending" ? null : (o.paidAt ?? now), deliveredAt: status === "delivered" ? now : null })
      .where(eq(shopOrders.id, orderId));
    await audit({ actorId, action: "shop.order_status", targetType: "shop_order", targetId: orderId, before: { status: o.status }, after: { status } }, tx);
    return { ok: true as const };
  });
}

/** Active admin emails, for "new order" mail. */
export async function adminEmails(): Promise<string[]> {
  const rows = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return rows.map((r) => r.email);
}

/** Keeps order history but strips the person out (used when an account is erased). */
export async function anonymizeOrders(tx: Pick<typeof db, "update">, userId: string) {
  await tx.update(shopOrders).set({ userId: null, buyerName: "Former member", buyerEmail: "removed@deleted.invalid" }).where(eq(shopOrders.userId, userId));
}
