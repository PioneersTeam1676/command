import type { Metadata } from "next";
import Link from "next/link";
import { Download, ShoppingBag } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { shopOrderStatuses, type ShopOrderStatus } from "@/db/schema";
import { readSettings } from "@/lib/settings";
import { allOrders, orderCounts, type OrderWithLines } from "@/lib/shop";
import { formatMoney } from "@/lib/shop-rules";
import { formatInTz } from "@/lib/time";
import { cn } from "@/lib/utils";
import { cancelOrderAdminAction, setOrderStatusAction } from "../actions";
import { ShopTabs } from "../shop-tabs";

export const metadata: Metadata = { title: "Shop orders" };
export const dynamic = "force-dynamic";

const TONE: Record<ShopOrderStatus, "warning" | "info" | "success" | "neutral"> = { pending: "warning", paid: "info", delivered: "success", cancelled: "neutral" };
const LABEL: Record<ShopOrderStatus, string> = { pending: "Waiting for payment", paid: "Paid", delivered: "Delivered", cancelled: "Cancelled" };

function StatusButton({ id, status, children, primary }: { id: string; status: "pending" | "paid" | "delivered"; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={setOrderStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={primary ? "primary" : "ghost"}>{children}</Button>
    </form>
  );
}

function OrderCard({ o, tz }: { o: OrderWithLines; tz: string }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{o.buyerName}</p>
          <p className="text-sm md:text-[13px] text-muted">{o.buyerEmail} · {formatInTz(o.createdAt, tz, "MMM d, h:mm a")}</p>
        </div>
        <Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge>
      </div>
      <ul className="divide-y text-sm">
        {o.lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{l.qty} × {l.itemName}</span>, {l.sizeLabel}
              {l.printText ? <span className="mt-0.5 block text-muted">Print: <span className="font-mono text-foreground">{l.printText}</span></span> : null}
            </span>
            <span className="font-mono text-muted">{formatMoney(l.unitPriceCents * l.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Total {formatMoney(o.totalCents)}</p>
        {o.status !== "cancelled" ? (
          <div className="flex flex-wrap items-center gap-1">
            {o.status === "pending" ? <StatusButton id={o.id} status="paid" primary>Mark paid</StatusButton> : null}
            {o.status === "paid" ? <StatusButton id={o.id} status="delivered" primary>Mark delivered</StatusButton> : null}
            {o.status === "paid" ? <StatusButton id={o.id} status="pending">Not paid after all</StatusButton> : null}
            {o.status === "delivered" ? <StatusButton id={o.id} status="paid">Not delivered</StatusButton> : null}
            <ConfirmAction
              label="Cancel order"
              danger
              title={`Cancel ${o.buyerName}'s order?`}
              description="Everything goes back in stock. This can't be undone."
              confirmLabel="Cancel order"
              action={cancelOrderAdminAction}
              fields={{ id: o.id }}
              variant="ghost"
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default async function ShopOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser({ min: "admin" });
  const { status: raw } = await searchParams;
  const status = shopOrderStatuses.find((s) => s === raw);
  const [tz, counts, orders, everything] = await Promise.all([readSettings().then((s) => s.timezone), orderCounts(), allOrders(status), allOrders()]);
  // What to buy in total: every live order, grouped by item and size.
  const totals = new Map<string, number>();
  for (const o of everything) if (o.status !== "cancelled") for (const l of o.lines) totals.set(`${l.itemName} · ${l.sizeLabel}`, (totals.get(`${l.itemName} · ${l.sizeLabel}`) ?? 0) + l.qty);
  const chip = (href: string, label: string, on: boolean, n?: number) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={cn("inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-[13px]", on ? "bg-hover font-medium" : "text-muted hover:bg-hover hover:text-foreground")}>
      {label}
      {n !== undefined ? <span className="font-mono text-xs text-muted">{n}</span> : null}
    </Link>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ShopTabs active="orders" pending={counts.pending} />
        <Button asChild variant="secondary" size="sm">
          <Link href="/api/export/shop"><Download /> Download CSV</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {chip("/admin/shop/orders", "All", !status, Object.values(counts).reduce((a, b) => a + b, 0))}
        {shopOrderStatuses.map((s) => chip(`/admin/shop/orders?status=${s}`, LABEL[s], status === s, counts[s]))}
      </div>
      {totals.size > 0 && !status ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Total to get (all live orders)</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {[...totals].sort().map(([k, n]) => (
              <li key={k}><span className="font-mono">{n}</span> × {k}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {orders.length === 0 ? (
        <EmptyState icon={<ShoppingBag aria-hidden />} title="No orders here">{status ? "Nothing with this status." : "When someone orders, it shows up here and you get an email."}</EmptyState>
      ) : (
        <div className="space-y-3">{orders.map((o) => <OrderCard key={o.id} o={o} tz={tz} />)}</div>
      )}
    </div>
  );
}
