import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Shirt } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextAreaField, TextField } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { readSettings } from "@/lib/settings";
import { listAllItems, orderCounts } from "@/lib/shop";
import { formatMoney, isShopOpen } from "@/lib/shop-rules";
import { toDatetimeLocal } from "@/lib/time";
import { saveShopSettingsAction } from "./actions";
import { ShopTabs } from "./shop-tabs";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

export default async function AdminShopPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser({ min: "admin" });
  const { saved } = await searchParams;
  const [s, items, counts] = await Promise.all([readSettings(), listAllItems(), orderCounts()]);
  const open = isShopOpen(s);
  // The stored end is the very end of the last day; show the day itself.
  const lastDay = s.shopClosesAt ? toDatetimeLocal(new Date(s.shopClosesAt.getTime() - 60_000), s.timezone).slice(0, 10) : "";
  return (
    <div className="space-y-6">
      <ShopTabs active="items" pending={counts.pending} />
      {saved ? <p role="status" className="rounded-[8px] bg-success-subtle p-3 text-sm text-success">Item saved.</p> : null}

      <Card className="max-w-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Shop status</h2>
          <Badge tone={open ? "success" : "neutral"}>{open ? "Open: people can order" : s.shopEnabled ? "Closed: end date passed" : "Hidden"}</Badge>
        </div>
        <ActionForm action={saveShopSettingsAction} className="space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={s.shopEnabled} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium">Open the shop</span>
              <span className="block text-sm md:text-[13px] text-muted">A “Shop” link appears in everyone&apos;s menu. Untick to hide it again.</span>
            </span>
          </label>
          <TextField name="closesAt" label="Last day to order (optional)" type="date" defaultValue={lastDay} help="Buyers are told to hand a mentor the money by this day. The shop closes itself after it." />
          <TextAreaField name="note" label="Message above the items (optional)" defaultValue={s.shopNote ?? ""} maxLength={500} help="For example: pickup is at the Tuesday meeting." />
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </ActionForm>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Items</h2>
          <Button asChild size="sm">
            <Link href="/admin/shop/items/new"><Plus /> Add item</Link>
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={<Shirt aria-hidden />} title="No items yet" action={<Button asChild><Link href="/admin/shop/items/new">Add your first item</Link></Button>}>
            Add a hoodie or a t-shirt, set sizes and how many you have, then open the shop above.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={`/admin/shop/items/${i.id}`} className="flex gap-3 rounded-[8px] border p-3 transition-colors hover:bg-surface">
                  {i.photoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/shop/photo/${i.photoPath}`} alt="" className="size-16 shrink-0 rounded-[6px] object-cover" />
                  ) : (
                    <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-[6px] bg-surface text-muted"><Shirt className="size-6" /></span>
                  )}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.name}</span>{i.active ? null : <Badge>Hidden</Badge>}</span>
                    <span className="block text-sm text-muted">{formatMoney(i.priceCents)}</span>
                    <span className="block text-sm md:text-[13px] text-muted">{i.sizes.map((z) => `${z.label}: ${z.stock}`).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
