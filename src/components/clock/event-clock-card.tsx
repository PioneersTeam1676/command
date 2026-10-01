"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useClock } from "./use-clock";

export type EventClockProps = {
  eventId: string;
  title: string;
  whenLabel: string;
  cancelled: boolean;
  canCheckIn: boolean;
  needsCode: boolean;
  goingLabel?: string;
  /** null = not checked in; otherwise the session state. */
  session: { clockedOut: boolean; inLabel: string; outLabel?: string } | null;
  opensLabel?: string;
};

export function EventClockCard(p: EventClockProps) {
  const { tap, busy, queue } = useClock();
  const [code, setCode] = useState("");
  const pending = queue.filter((q) => q.eventId === p.eventId);
  const last = pending[pending.length - 1];
  const checkedIn = last ? last.action === "in" : Boolean(p.session && !p.session.clockedOut);
  const done = !last && p.session?.clockedOut;

  async function onTap() {
    const r = await tap({ action: checkedIn ? "out" : "in", kind: "event", eventId: p.eventId, code: !checkedIn && p.needsCode ? code : undefined, label: `${checkedIn ? "Clock out of" : "Check in to"} ${p.title}` });
    if (!r.ok) toast.error(r.error ?? "That didn't work.");
    else if (r.queued) toast.message("Saved on this phone. It will sync when you're back online.");
    else setCode("");
  }

  return (
    <div className={cn("rounded-[10px] border p-5 md:rounded-[8px] md:p-4", checkedIn && "border-accent bg-accent-subtle/50")}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/calendar/${p.eventId}`} className="min-w-0">
          <p className={cn("truncate font-medium", p.cancelled && "text-muted line-through")}>{p.title}</p>
          <p className="font-mono text-[13px] md:text-[12px] text-muted">{p.whenLabel}</p>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {p.cancelled ? <Badge tone="error">Cancelled</Badge> : null}
          {p.goingLabel ? <Badge>{p.goingLabel}</Badge> : null}
          {checkedIn ? <Badge tone="success">Checked in</Badge> : null}
          {done ? <Badge tone="success">Done</Badge> : null}
        </div>
      </div>

      {p.cancelled ? null : done ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm md:text-[13px] text-muted">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          {p.session!.inLabel} – {p.session!.outLabel}
        </p>
      ) : p.canCheckIn || checkedIn ? (
        <div className="mt-3 space-y-2">
          {!checkedIn && p.needsCode ? (
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code from the screen"
                aria-label="Check-in code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
                className="font-mono tracking-widest"
              />
            </div>
          ) : null}
          <Button onClick={onTap} disabled={busy || (!checkedIn && p.needsCode && code.replace(/\s/g, "").length !== 6)} variant={checkedIn ? "secondary" : "primary"} size="lg" className="w-full">
            {checkedIn ? "Clock out of event" : "Check in"}
          </Button>
          {pending.length > 0 ? <p className="text-[13px] md:text-[12px] text-warning">Saved on this phone. Will sync when you&apos;re back online.</p> : null}
        </div>
      ) : p.opensLabel ? (
        <p className="mt-3 text-sm md:text-[13px] text-muted">{p.opensLabel}</p>
      ) : null}
    </div>
  );
}
