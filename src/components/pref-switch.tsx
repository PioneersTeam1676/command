"use client";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export function PrefSwitch({ type, label, description, enabled, action }: { type: string; label: string; description: string; enabled: boolean; action: (type: string, enabled: boolean) => Promise<{ ok: boolean }> }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pending, start] = useTransition();
  const id = `pref-${type}`;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <p className="text-sm md:text-[13px] text-muted">{description}</p>
      </div>
      <Switch
        id={id}
        checked={optimistic}
        disabled={pending}
        aria-label={label}
        onCheckedChange={(v) =>
          start(async () => {
            setOptimistic(v);
            const r = await action(type, v);
            if (!r.ok) toast.error("That didn't save. Try again.");
          })
        }
      />
    </div>
  );
}
