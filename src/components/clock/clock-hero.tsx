"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CloudOff, Loader2, ShieldAlert, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
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
  /** Clocking in is possible (false only while Command is read-only). */
  canClockIn: boolean;
  /** Plain-language status line when there's nothing to tap. */
  idleMessage: string;
  cutoffLabel: string;
  /** Outside build season or past the cutoff: a lead has to approve the time. */
  offHours?: boolean;
  /** Team setting: only warn about off-hours when this is on. */
  showOffHoursNotice?: boolean;
  /** Ask what the member did before clocking out. */
  noteMode?: "off" | "optional" | "required";
};

export function ClockHero({ runningSince, canClockIn, idleMessage, cutoffLabel, offHours = false, showOffHoursNotice = false, noteMode = "off" }: HeroProps) {
  const { tap, busy, queue } = useClock();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
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

  function onTap() {
    if (running && noteMode !== "off") setNoteOpen(true);
    else void submit();
  }

  async function submit(text?: string) {
    const r = await tap({ action: running ? "out" : "in", kind: "open", label: running ? "Clock out" : "Clock in", note: text });
    if (!r.ok) toast.error(r.error ?? "That didn't work.");
    else if (r.queued) toast.message("Saved on this phone. It will sync when you're back online.");
    else if (r.offHours && showOffHoursNotice) toast.message("You're clocked in. Since it's outside build hours, a lead will approve this time.");
    else if (r.autoClosed) toast.message(`You were past the ${cutoffLabel} cutoff, so we closed your time there. A lead may review it.`);
    else if (running) setNote("");
    if (r.ok) setNoteOpen(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 py-4">
      <div className="flex flex-col items-center gap-2" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="relative flex size-2">
            {running ? <span className="clock-dot absolute inline-flex size-full rounded-full bg-success" /> : null}
            <span className={cn("relative inline-flex size-2 rounded-full", running ? "bg-success" : "bg-muted/50")} />
          </span>
          {running ? "Clocked in" : canClockIn ? "Clocked out" : idleMessage}
        </p>
        <p className={cn("font-mono text-6xl font-light tabular-nums tracking-tight transition-colors duration-300", running ? "text-foreground" : "text-muted")}>
          {fmt(elapsed)}
        </p>
      </div>

      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label={running ? "Clock out" : "Clock in"}
        className={cn(
          "group flex h-12 w-full items-center justify-center gap-2.5 rounded-lg text-[15px] font-medium transition-[background-color,transform,box-shadow,color] duration-200 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
          running
            ? "border border-error/40 bg-error-subtle text-error hover:bg-error hover:text-white"
            : "bg-foreground text-background hover:bg-foreground/85",
        )}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : running ? (
          <Square className="size-4 fill-current" aria-hidden />
        ) : null}
        {running ? "Clock out" : "Clock in"}
        {!running && !busy ? <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /> : null}
      </button>

      {pending ? (
        <p className="flex items-center gap-1.5 text-center text-sm text-warning">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Saved on this phone. Will sync when you&apos;re back online.
        </p>
      ) : offHours && showOffHoursNotice && !running ? (
        <p className="flex items-center gap-1.5 text-center text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          Outside build hours. A lead will approve this time.
        </p>
      ) : running ? (
        <p className="text-center text-sm text-muted">Auto clock-out at {cutoffLabel} if you forget.</p>
      ) : null}

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent title="What did you work on?" description={noteMode === "required" ? "Add a quick note before you clock out." : "Optional. Leads can see this with your hours."}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(note);
            }}
            className="space-y-4"
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={3}
              autoFocus
              required={noteMode === "required"}
              aria-label="What did you work on?"
              placeholder="e.g. Wired the drivetrain, cut the arm brackets"
            />
            <Button type="submit" className="w-full" disabled={busy || (noteMode === "required" && !note.trim())}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Clock out
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
