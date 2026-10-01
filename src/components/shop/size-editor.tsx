"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { key: number; id: string; label: string; stock: string };
const PRESET = ["S", "M", "L", "XL", "2XL"];

/** One row per size with how many you have. Rows are submitted as parallel fields (sizeId, sizeLabel, sizeStock). */
export function SizeEditor({ initial }: { initial: { id: string; label: string; stock: number }[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((s, i) => ({ key: i, id: s.id, label: s.label, stock: String(s.stock) })));
  const [next, setNext] = useState(initial.length);
  const add = (label = "", stock = "") => {
    setRows((r) => [...r, { key: next, id: "", label, stock }]);
    setNext((n) => n + 1);
  };
  const addPreset = () => {
    const have = new Set(rows.map((r) => r.label.toLowerCase()));
    PRESET.filter((l) => !have.has(l.toLowerCase())).forEach((l, i) => setRows((r) => [...r, { key: next + i, id: "", label: l, stock: "0" }]));
    setNext((n) => n + PRESET.length);
  };
  const set = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Sizes and how many you have</legend>
      <p className="text-sm md:text-[13px] text-muted">One row per size. If it has no sizes, add a single row called “One size”.</p>
      {rows.length > 0 ? (
        <ul className="space-y-2">
          <li aria-hidden className="grid grid-cols-[1fr_96px_44px] gap-2 text-xs text-muted">
            <span>Size</span>
            <span>In stock</span>
            <span />
          </li>
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[1fr_96px_44px] items-center gap-2">
              <input type="hidden" name="sizeId" value={r.id} />
              <Input name="sizeLabel" aria-label="Size name" value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} maxLength={20} placeholder="M" />
              <Input name="sizeStock" aria-label={`How many ${r.label || "of this size"} in stock`} type="number" inputMode="numeric" min={0} max={100000} value={r.stock} onChange={(e) => set(r.key, { stock: e.target.value })} placeholder="0" />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove size ${r.label}`} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => add()}>
          <Plus /> Add a size
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={addPreset}>
          Add S, M, L, XL, 2XL
        </Button>
      </div>
    </fieldset>
  );
}
