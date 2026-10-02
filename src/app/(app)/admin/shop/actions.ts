"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { MAX_SHOP_PHOTO_BYTES, deleteShopPhoto, saveShopPhoto, sniffImage } from "@/lib/files";
import { parseForm, type FormState } from "@/lib/form";
import { getSettings, updateSettings } from "@/lib/settings";
import { cancelOrder, deleteItem, getItem, saveItem, setOrderStatus } from "@/lib/shop";
import { parsePrice } from "@/lib/shop-rules";
import { endOfLocalDay, isLocalDate } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";

const refresh = () => {
  revalidatePath("/admin/shop", "layout");
  revalidatePath("/shop", "layout");
  revalidatePath("/", "layout"); // the navigation shows Shop only while it's open
};

export async function saveShopSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const s = await getSettings();
  const enabled = fd.get("enabled") === "on";
  const closeDate = String(fd.get("closesAt") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);
  let closesAt: Date | null = null;
  if (closeDate) {
    if (!isLocalDate(closeDate)) return { error: "Pick the last day of the shop.", fieldErrors: { closesAt: "Pick a date." } };
    closesAt = endOfLocalDay(closeDate, s.timezone); // open through the whole of that day
    if (enabled && closesAt.getTime() < Date.now()) return { error: "That end date has already passed. Pick a later one, or clear it.", fieldErrors: { closesAt: "Pick a date that hasn't passed." } };
  }
  await updateSettings({ shopEnabled: enabled, shopClosesAt: closesAt, shopNote: note || null });
  await audit({ actorId: admin.id, action: "shop.settings", targetType: "settings", after: { enabled, closesAt, note: note ? "(set)" : "(none)" } });
  refresh();
  return { success: enabled ? "Saved. The shop is open." : "Saved. The shop is hidden." };
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Give the item a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  price: z.string().refine((v) => parsePrice(v) !== null, "Enter a price like 25 or 24.99."),
  personalize: z.enum(["none", "optional", "required"]),
  personalizeLabel: z.string().trim().min(1, "Say what the buyer is typing.").max(60).default("Name to print"),
  personalizeMax: z.coerce.number().int().min(1, "At least 1.").max(100, "At most 100."),
});

export async function saveItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const keep = ["name", "description", "price", "personalize", "personalizeLabel", "personalizeMax"];
  const parsed = parseForm(itemSchema, fd, { keepValues: keep });
  if (!parsed.ok) return parsed.state;
  const idRaw = fd.get("id");
  const id = idRaw ? uuidSchema.safeParse(idRaw) : null;
  if (id && !id.success) return { error: "Unknown item." };

  const ids = fd.getAll("sizeId").map(String);
  const labels = fd.getAll("sizeLabel").map((v) => String(v).trim());
  const stocks = fd.getAll("sizeStock").map((v) => Number(String(v).trim() === "" ? NaN : v));
  const sizes = labels.map((label, i) => ({ id: ids[i] || undefined, label, stock: stocks[i]! })).filter((s) => s.label !== "" || s.id);

  let photoPath: string | null | undefined;
  const photo = fd.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_SHOP_PHOTO_BYTES) return { error: "Photo must be under 3 MB.", fieldErrors: { photo: "That file is too big (max 3 MB)." }, values: Object.fromEntries(keep.map((k) => [k, String(fd.get(k) ?? "")])) };
    const buf = Buffer.from(await photo.arrayBuffer());
    const type = sniffImage(buf);
    if (!type) return { error: "Photo must be a PNG, JPEG or WebP image.", fieldErrors: { photo: "Use a PNG, JPEG or WebP image." }, values: Object.fromEntries(keep.map((k) => [k, String(fd.get(k) ?? "")])) };
    photoPath = await saveShopPhoto(buf, type.ext);
  } else if (fd.get("removePhoto") === "on") photoPath = null;

  const before = id?.success ? await getItem(id.data) : undefined;
  const r = await saveItem(
    admin.id,
    id?.success ? id.data : null,
    {
      name: parsed.data.name,
      description: parsed.data.description,
      priceCents: parsePrice(parsed.data.price)!,
      personalize: parsed.data.personalize,
      personalizeLabel: parsed.data.personalizeLabel,
      personalizeMax: parsed.data.personalizeMax,
      active: fd.get("active") === "on",
      sizes,
    },
    photoPath,
  );
  if (!r.ok) {
    if (photoPath) await deleteShopPhoto(photoPath);
    return { error: r.error, values: Object.fromEntries(keep.map((k) => [k, String(fd.get(k) ?? "")])) };
  }
  if (photoPath !== undefined && before?.photoPath) await deleteShopPhoto(before.photoPath);
  refresh();
  redirect("/admin/shop?saved=1");
}

export async function deleteItemAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  const r = await deleteItem(admin.id, id.data);
  if (r.ok && r.photoPath) await deleteShopPhoto(r.photoPath);
  refresh();
  redirect(r.ok ? "/admin/shop?deleted=1" : "/admin/shop");
}

export async function setOrderStatusAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, status: z.enum(["pending", "paid", "delivered"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await setOrderStatus(admin.id, p.data.id, p.data.status);
  refresh();
}

export async function cancelOrderAdminAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  await cancelOrder({ id: admin.id, isAdmin: true }, id.data);
  refresh();
}
