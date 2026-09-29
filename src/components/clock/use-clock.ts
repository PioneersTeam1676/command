"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueTap, listQueue, newActionId, syncQueue, type QueuedTap } from "@/lib/offline-queue";

export type TapInput = { action: "in" | "out"; kind: "open" | "event"; eventId?: string; code?: string; label: string };
export type TapResult = { ok: boolean; queued?: boolean; error?: string; autoClosed?: boolean; offHours?: boolean };

/** Shared clock logic: online taps go straight to the server, offline taps are queued with the device time. */
export function useClock() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedTap[]>([]);
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await listQueue());
    } catch {
      /* IndexedDB unavailable (private mode): queueing is off, online taps still work */
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const out = await syncQueue();
      for (const f of out.failed) toast.error(`${f.tap.label}: ${f.error}`);
      if (out.synced > 0) toast.success(out.synced === 1 ? "Your offline tap was saved." : `${out.synced} offline taps were saved.`);
      if (out.synced > 0 || out.failed.length > 0) router.refresh();
    } finally {
      syncing.current = false;
      await refreshQueue();
    }
  }, [refreshQueue, router]);

  useEffect(() => {
    const kick = () => void sync();
    // Initial load, reconnect, and coming back to the app all try to flush the queue.
    kick();
    window.addEventListener("online", kick);
    const vis = () => document.visibilityState === "visible" && kick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [sync]);

  const tap = useCallback(
    async (input: TapInput): Promise<TapResult> => {
      const actionId = newActionId();
      const clientTime = new Date().toISOString();
      setBusy(true);
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return await queueTap(input, actionId, clientTime);
        let res: Response;
        try {
          res = await fetch("/api/clock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ actionId, action: input.action, kind: input.kind, eventId: input.eventId, code: input.code, clientTime }),
          });
        } catch {
          return await queueTap(input, actionId, clientTime); // network dropped mid-request
        }
        if (res.status === 401) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return { ok: false, error: "Please sign in again." };
        }
        const json = (await res.json()) as TapResult;
        router.refresh();
        return json;
      } finally {
        setBusy(false);
      }
    },
    // queueTap is stable (defined below via function hoisting)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  async function queueTap(input: TapInput, actionId: string, clientTime: string): Promise<TapResult> {
    if (input.kind === "event" && input.code) {
      return { ok: false, error: "This event needs a check-in code, so you have to be online to check in." };
    }
    try {
      await enqueueTap({ actionId, action: input.action, kind: input.kind, eventId: input.eventId, clientTime, label: input.label });
    } catch {
      return { ok: false, error: "You're offline and this browser can't save the tap. Try again when you have signal." };
    }
    await refreshQueue();
    // Ask the browser to flush this in the background too (Chrome/Android); otherwise the next foreground does.
    navigator.serviceWorker?.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } }).sync?.register("command-sync"))
      .catch(() => undefined);
    return { ok: true, queued: true };
  }

  return { tap, busy, queue, sync };
}
