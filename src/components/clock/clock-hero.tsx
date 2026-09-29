"use client";
import { useEffect, useState } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClock } from "./use-clock";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export type HeroProps = {
  /** ISO start of the currently running open session, if any. */
  runningSince: string | null;
  /** Open clock-in allowed right now (build season, before cutoff, not already used today). */
  canClockIn: boolean;
  /** Plain-language status line when there's nothing to tap. */
  idleMessage: string;
  cutoffLabel: string;
};

export function ClockHero({ runningSince, canClockIn, idleMessage, cutoffLabel }: HeroProps) {
  const { tap, busy, queue } = useClock();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A tap made offline shows immediately, before it has synced.
  const pendingOpen = queue.filter((q) => q.kind === "open");
  const last = pendingOpen[pendingOpen.length - 1];
  const localRunning = last ? (last.action === "in" ? last.clientTime : null) : runningSince;
  const running = Boolean(localRunning);
  const pending = pendingOpen.length > 0;
  const elapsed = localRunning ? now - new Date(localRunning).getTime() : 0;
  const disabled = busy || (!running && !canClockIn && !pending);

  async function onTap() {
    const r = await tap({ action: running ? "out" : "in", kind: "open", label: running ? "Clock out" : "Clock in" });
    if (!r.ok) toast.error(r.error ?? "That didn't work.");
    else if (r.queued) toast.message("Saved on this phone. It will sync when you're back online.");
    else if (r.autoClosed) toast.message(`You were past the ${cutoffLabel} cutoff, so we closed your time there. A lead may review it.`);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted" aria-live="polite">
        {running ? "You're clocked in" : canClockIn ? "You're clocked out" : idleMessage}
      </p>
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label={running ? "Clock out" : "Clock in"}
        className={cn(
          "grid size-52 place-items-center rounded-full border text-center transition-[background-color,transform,box-shadow] duration-200 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 md:size-56",
          running ? "border-transparent bg-accent text-accent-fg shadow-[0_0_0_8px_var(--accent-subtle)]" : "bg-surface text-foreground hover:bg-background",
        )}
      >
        <span className="flex flex-col items-center gap-1">
          {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : null}
          {running ? <span className="font-mono text-[28px] font-medium tabular-nums">{fmt(elapsed)}</span> : null}
          <span className={cn("font-semibold", running ? "text-lg" : "text-2xl")}>{running ? "Clock out" : "Clock in"}</span>
        </span>
      </button>
      {pending ? (
        <p className="flex items-center gap-1.5 text-[13px] text-warning">
          <CloudOff className="size-4" aria-hidden />
          Saved on this phone. Will sync when you&apos;re back online.
        </p>
      ) : running ? (
        <p className="text-[13px] text-muted">We&apos;ll clock you out automatically at {cutoffLabel} if you forget.</p>
      ) : null}
    </div>
  );
}
