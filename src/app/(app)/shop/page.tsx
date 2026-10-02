import type { Metadata } from "next";
import Link from "next/link";
import { Shirt } from "lucide-react";
import { Storefront, type StoreItem } from "@/components/shop/storefront";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings";
import { listStoreItems } from "@/lib/shop";
import { isShopOpen } from "@/lib/shop-rules";
import { formatInTz } from "@/lib/time";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const user = await requireUser();
  if (user.role === "parent") redirect("/parent");
  const s = await getSettings();
  const admin = roleAtLeast(user.role, "admin");
  if (!isShopOpen(s)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>
        <EmptyState icon={<Shirt aria-hidden />} title="The shop is closed right now" action={admin ? <Button asChild><Link href="/admin/shop">Open it in Admin</Link></Button> : undefined}>
          Check back when the team opens it again.
        </EmptyState>
      </div>
    );
  }
  const items: StoreItem[] = (await listStoreItems()).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    priceCents: i.priceCents,
    photoUrl: i.photoPath ? `/api/shop/photo/${i.photoPath}` : null,
    personalize: i.personalize,
    personalizeLabel: i.personalizeLabel,
    personalizeMax: i.personalizeMax,
    sizes: i.sizes.map((z) => ({ id: z.id, label: z.label, stock: z.stock })),
  }));
  const payBy = s.shopClosesAt ? formatInTz(new Date(s.shopClosesAt.getTime() - 60_000), s.timezone, "EEEE, MMMM d") : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>
          <p className="text-sm text-muted">{payBy ? `Order by ${payBy}. ` : ""}Pay a mentor in cash.</p>
        </div>
        <Button asChild variant="secondary" size="sm"><Link href="/shop/orders">My orders</Link></Button>
      </div>
      {s.shopNote ? <p className="whitespace-pre-line rounded-lg border bg-surface p-3 text-sm">{s.shopNote}</p> : null}
      {items.length === 0 ? <EmptyState icon={<Shirt aria-hidden />} title="Nothing for sale yet">Items will show up here.</EmptyState> : <Storefront items={items} payBy={payBy} />}
    </div>
  );
}
