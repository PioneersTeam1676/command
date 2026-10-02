"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Shirt, ShoppingBag, Trash2 } from "lucide-react";
import { placeOrderAction } from "@/app/(app)/shop/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { formatMoney, normalizePrintText } from "@/lib/shop-rules";

export type StoreItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  photoUrl: string | null;
  personalize: "none" | "optional" | "required";
  personalizeLabel: string;
  personalizeMax: number;
  sizes: { id: string; label: string; stock: number }[];
};

type CartLine = { key: number; item: StoreItem; sizeId: string; qty: number; printText: string };

function ItemCard({ item, onAdd, leftInCart }: { item: StoreItem; onAdd: (l: Omit<CartLine, "key">) => void; leftInCart: (sizeId: string) => number }) {
  const firstAvailable = item.sizes.find((s) => s.stock > 0)?.id ?? "";
  const [sizeId, setSizeId] = useState(firstAvailable);
  const [qty, setQty] = useState(1);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const soldOut = item.sizes.every((s) => s.stock === 0);
  const room = sizeId ? Math.max(0, (item.sizes.find((s) => s.id === sizeId)?.stock ?? 0) - leftInCart(sizeId)) : 0;

  const add = () => {
    if (!sizeId) return setError("Pick a size.");
    if (qty > room) return setError(room === 0 ? "No more of that size." : `Only ${room} more available.`);
    const t = normalizePrintText(text, { mode: item.personalize, max: item.personalizeMax });
    if (!t.ok) return setError(t.error);
    setError("");
    onAdd({ item, sizeId, qty, printText: t.value ?? "" });
    setQty(1);
    setText("");
  };

  return (
    <Card role="group" aria-label={item.name} className="flex min-w-0 flex-col overflow-hidden">
      {item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photoUrl} alt={item.name} className="aspect-[4/3] w-full border-b object-cover" />
      ) : (
        <div aria-hidden className="grid aspect-[4/3] w-full place-items-center border-b bg-surface text-muted"><Shirt className="size-8" strokeWidth={1.5} /></div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{item.name}</h3>
            <span className="shrink-0 font-mono text-sm">{formatMoney(item.priceCents)}</span>
          </div>
          {item.description ? <p className="mt-1 text-[13px] text-muted">{item.description}</p> : null}
        </div>
        {soldOut ? (
          <p className="text-sm font-medium text-muted">Sold out</p>
        ) : (
          <>
            <label className="block space-y-1.5 text-[13px]">
              <span className="font-medium">Size</span>
              <Select value={sizeId} onChange={(e) => { setSizeId(e.target.value); setError(""); }}>
                {item.sizes.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.stock === 0}>
                    {s.label}{s.stock === 0 ? " (sold out)" : s.stock <= 5 ? ` (${s.stock} left)` : ""}
                  </option>
                ))}
              </Select>
            </label>
            {item.personalize !== "none" ? (
              <label className="block space-y-1.5 text-[13px]">
                <span className="font-medium">{item.personalizeLabel}{item.personalize === "optional" ? " (optional)" : ""}</span>
                <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={item.personalizeMax} placeholder="Exactly as you want it" />
                {text ? <span className="block text-xs text-muted">It will say: <span className="font-mono text-foreground">{text.trim().replace(/\s+/g, " ")}</span></span> : null}
              </label>
            ) : null}
            <div className="mt-auto flex items-center gap-2 pt-1">
              <div className="flex shrink-0 items-center rounded-md border">
                <Button type="button" variant="ghost" size="icon" aria-label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus /></Button>
                <span className="w-7 text-center font-mono text-sm" aria-live="polite">{qty}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="One more" onClick={() => setQty((q) => Math.min(20, q + 1))}><Plus /></Button>
              </div>
              <Button type="button" onClick={add} className="min-w-0 flex-1">Add to order</Button>
            </div>
            {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
          </>
        )}
      </div>
    </Card>
  );
}

/** Browse, add things to an order, and send it. Nothing is charged: the confirmation says to hand a mentor the money. */
export function Storefront({ items, payBy }: { items: StoreItem[]; payBy: string | null }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [next, setNext] = useState(0);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const total = useMemo(() => cart.reduce((n, l) => n + l.item.priceCents * l.qty, 0), [cart]);
  const inCart = (sizeId: string) => cart.filter((l) => l.sizeId === sizeId).reduce((n, l) => n + l.qty, 0);

  const submit = () =>
    start(async () => {
      setError("");
      const r = await placeOrderAction(cart.map((l) => ({ sizeId: l.sizeId, qty: l.qty, printText: l.printText })));
      if (r.ok) router.push("/shop/orders?placed=1");
      else {
        setError(r.error);
        router.refresh(); // stock may have changed under us
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} leftInCart={inCart} onAdd={(l) => { setCart((c) => [...c, { ...l, key: next }]); setNext((n) => n + 1); }} />
        ))}
      </div>
      <aside aria-label="Your order" className="lg:sticky lg:top-6">
        <Card className="space-y-4 p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><ShoppingBag className="size-4" aria-hidden /> Your order</h2>
          {cart.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Pick a size and tap “Add to order”.</p>
          ) : (
            <ul className="divide-y text-sm">
              {cart.map((l) => (
                <li key={l.key} className="flex items-start justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{l.qty} × {l.item.name}</span>, {l.item.sizes.find((s) => s.id === l.sizeId)?.label}
                    {l.printText ? <span className="block text-muted">Print: <span className="font-mono text-foreground">{l.printText}</span></span> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-muted">{formatMoney(l.item.priceCents * l.qty)}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Remove ${l.item.name}`} onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}><Trash2 /></Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {cart.length > 0 ? (
            <>
              <div className="flex items-center justify-between border-t pt-3 font-semibold"><span>Total</span><span className="font-mono">{formatMoney(total)}</span></div>
              <p className="text-sm md:text-[13px] text-muted">No payment online. After you order, hand a mentor {formatMoney(total)} {payBy ? `by ${payBy}` : "soon"}. We&apos;ll email you the details.</p>
              {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
              <Button type="button" className="w-full" onClick={submit} disabled={pending}>{pending ? "Sending…" : "Place order"}</Button>
            </>
          ) : null}
        </Card>
      </aside>
    </div>
  );
}
