"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { SNOOZE_MS, shouldShowPushPrompt, snoozeAfterAsk } from "@/lib/push-prompt";
import { enablePush } from "./push-enable";

const KEY = "push-prompt-snoozed-until";

function readSnooze(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** First time someone opens the installed app without notifications, ask once. A tap is required by browsers, so this is a sheet with a button. */
export function PushPrompt({ vapidPublicKey }: { vapidPublicKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const show = shouldShowPushPrompt({
      standalone,
      supported,
      ios,
      permission: supported ? Notification.permission : "unsupported",
      snoozedUntil: readSnooze(),
      now: Date.now(),
    });
    // Reading browser state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (show && vapidPublicKey) setOpen(true);
  }, [vapidPublicKey]);

  function snooze() {
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* storage blocked: the sheet may return next visit, which is acceptable */
    }
    setOpen(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await enablePush(vapidPublicKey);
      if (snoozeAfterAsk(permission)) snooze();
      if (permission === "granted") toast.success("Notifications are on for this device.");
      else toast.message(permission === "denied" ? "Notifications are blocked for this site." : "No problem. You can turn them on any time in Me.");
    } catch {
      toast.error("We couldn't turn notifications on. You can try again in Me.");
    } finally {
      setBusy(false);
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : snooze())}>
      <DialogContent
        side="bottom"
        title="Get clock-in reminders"
        description="We'll only send reminders and event updates. You can change this any time in Me."
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primary.current?.focus();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button ref={primary} size="lg" onClick={enable} disabled={busy}>{busy ? "Working…" : "Enable notifications"}</Button>
          <DialogClose asChild>
            <Button variant="ghost" size="lg">Not now</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
