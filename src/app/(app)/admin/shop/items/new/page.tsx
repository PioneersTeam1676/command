import type { Metadata } from "next";
import Link from "next/link";
import { ItemForm } from "@/components/shop/item-form";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Add shop item" };

export default async function NewItemPage() {
  await requireUser({ min: "admin" });
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/shop" className="text-sm text-muted hover:text-foreground">← Back to shop</Link>
      <h2 className="text-xl font-semibold">Add an item</h2>
      <ItemForm />
    </div>
  );
}
