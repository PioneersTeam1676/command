"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { cancelOrder, placeOrder } from "@/lib/shop";
import { sendOrderMessages } from "@/lib/shop-mail";
import { uuidSchema } from "@/lib/validation";

const cartSchema = z
  .array(z.object({ sizeId: uuidSchema, qty: z.number().int().min(1).max(20), printText: z.string().max(200) }))
  .min(1, "Your cart is empty.")
  .max(20, "An order can have at most 20 items.");

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };

/** Members, leads and admins can order. Parents can't (they have their own, read-only area). */
export async function placeOrderAction(cart: unknown): Promise<PlaceOrderResult> {
  const user = await requireActionUser("member");
  const parsed = cartSchema.safeParse(cart);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your cart." };
  const r = await placeOrder({ id: user.id, name: user.name, email: user.email }, parsed.data);
  if (!r.ok) return r;
  revalidatePath("/shop", "layout");
  revalidatePath("/admin/shop", "layout");
  void sendOrderMessages(r.order);
  return { ok: true };
}

export async function cancelMyOrderAction(fd: FormData) {
  const user = await requireActionUser("member");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  await cancelOrder({ id: user.id, isAdmin: false }, id.data);
  revalidatePath("/shop", "layout");
  revalidatePath("/admin/shop", "layout");
}
