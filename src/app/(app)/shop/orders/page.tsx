import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings";
import { myOrders } from "@/lib/shop";
import { formatMoney } from "@/lib/shop-rules";
import { formatInTz } from "@/lib/time";
import { cancelMyOrderAction } from "../actions";

export const metadata: Metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

const LABEL = { pending: "Hand a mentor the money", paid: "Paid", delivered: "Delivered", cancelled: "Cancelled" } as const;
const TONE = { pending: "warning", paid: "info", delivered: "success", cancelled: "neutral" } as const;

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const user = await requireUser();
  const { placed } = await searchParams;
  const [orders, s] = await Promise.all([myOrders(user.id), getSettings()]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold">My orders</h1>
        <Button asChild variant="secondary" size="sm"><Link href="/shop">Back to shop</Link></Button>
      </div>
      {placed ? (
        <p role="status" className="flex items-start gap-2 rounded-[8px] border border-success/30 bg-success-subtle p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> Order placed. We emailed you. Hand a mentor the money to finish.
        </p>
      ) : null}
      {orders.length === 0 ? (
        <EmptyState icon={<ShoppingBag aria-hidden />} title="No orders yet" action={<Button asChild><Link href="/shop">Browse the shop</Link></Button>} />
      ) : (
        orders.map((o) => (
          <Card key={o.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{formatInTz(o.createdAt, s.timezone, "MMM d, h:mm a")}</p>
              <Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge>
            </div>
            <ul className="divide-y text-sm">
              {o.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{l.qty} × {l.itemName}</span>, {l.sizeLabel}
                    {l.printText ? <span className="block text-muted">Print: <span className="font-mono text-foreground">{l.printText}</span></span> : null}
                  </span>
                  <span className="font-mono text-muted">{formatMoney(l.unitPriceCents * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Total {formatMoney(o.totalCents)}{o.status === "pending" && o.payByAt ? <span className="ml-2 text-sm font-normal text-muted">pay by {formatInTz(new Date(o.payByAt.getTime() - 60_000), s.timezone, "MMM d")}</span> : null}</p>
              {o.status === "pending" ? (
                <ConfirmAction label="Cancel order" variant="ghost" danger title="Cancel this order?" description="The items go back on the shelf. You can order again any time the shop is open." confirmLabel="Cancel order" action={cancelMyOrderAction} fields={{ id: o.id }} />
              ) : null}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
