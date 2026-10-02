import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { SizeEditor } from "@/components/shop/size-editor";
import { Card } from "@/components/ui/card";
import type { ShopItemWithSizes } from "@/lib/shop";
import { saveItemAction } from "@/app/(app)/admin/shop/actions";

const price = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** Add or edit one merch item: photo, price, sizes with stock, and whether buyers type something to print. */
export function ItemForm({ item }: { item?: ShopItemWithSizes }) {
  return (
    <Card className="p-5">
      <ActionForm action={saveItemAction} className="space-y-5">
        {item ? <input type="hidden" name="id" value={item.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <TextField name="name" label="Name" defaultValue={item?.name} required maxLength={80} placeholder="Team hoodie" />
          <TextField name="price" label="Price ($)" defaultValue={item ? price(item.priceCents) : ""} required inputMode="decimal" placeholder="35" />
        </div>
        <TextAreaField name="description" label="Description (optional)" defaultValue={item?.description ?? ""} maxLength={500} />
        <div className="space-y-2">
          <TextField name="photo" label="Photo" type="file" accept="image/png,image/jpeg,image/webp" help="PNG, JPEG or WebP, up to 3 MB." />
          {item?.photoPath ? (
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input type="checkbox" name="removePhoto" className="size-4 accent-foreground" /> Remove the current photo
            </label>
          ) : null}
        </div>
        <SizeEditor initial={item?.sizes.map((s) => ({ id: s.id, label: s.label, stock: s.stock })) ?? [{ id: "", label: "One size", stock: 0 }]} />
        <div className="space-y-3 rounded-lg border p-4">
          <SelectField
            name="personalize"
            label="Print something on it?"
            defaultValue={item?.personalize ?? "none"}
            options={[
              { value: "none", label: "No, nothing to type" },
              { value: "optional", label: "Yes, buyer can type something (optional)" },
              { value: "required", label: "Yes, buyer must type something" },
            ]}
            help="For example a name on the back. The buyer types it exactly as they want it: “Alex”, “Alexander”, “Alex R.”."
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <TextField name="personalizeLabel" label="What the buyer sees" defaultValue={item?.personalizeLabel ?? "Name to print"} maxLength={60} />
            <TextField name="personalizeMax" label="Max characters" type="number" min={1} max={100} defaultValue={item?.personalizeMax ?? 30} />
          </div>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="mt-1 size-4 accent-foreground" />
          <span>
            <span className="font-medium">Show in the shop</span>
            <span className="block text-sm md:text-[13px] text-muted">Untick to hide it without deleting it. Old orders keep working.</span>
          </span>
        </label>
        <SubmitButton pendingText="Saving…">{item ? "Save item" : "Add item"}</SubmitButton>
      </ActionForm>
    </Card>
  );
}
