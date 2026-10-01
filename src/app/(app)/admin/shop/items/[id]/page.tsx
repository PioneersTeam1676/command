import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { ItemForm } from "@/components/shop/item-form";
import { requireUser } from "@/lib/auth/current-user";
import { getItem } from "@/lib/shop";
import { uuidSchema } from "@/lib/validation";
import { deleteItemAction } from "../../actions";

export const metadata: Metadata = { title: "Edit shop item" };
export const dynamic = "force-dynamic";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser({ min: "admin" });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const item = await getItem(id);
  if (!item) notFound();
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/shop" className="text-sm text-muted hover:text-foreground">← Back to shop</Link>
      <h2 className="text-xl font-semibold">{item.name}</h2>
      <ItemForm item={item} />
      <ConfirmAction
        label="Delete item"
        danger
        title={`Delete “${item.name}”?`}
        description="It disappears from the shop. Orders that already include it keep their details. To just stop selling it, untick “Show in the shop” instead."
        confirmLabel="Delete item"
        action={deleteItemAction}
        fields={{ id: item.id }}
      />
    </div>
  );
}
