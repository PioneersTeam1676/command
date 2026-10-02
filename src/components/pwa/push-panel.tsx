"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Env = { supported: boolean; ios: boolean; standalone: boolean; permission: NotificationPermission | "unsupported"; subscribed: boolean };

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readEnv(): Promise<Env> {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let subscribed = false;
  if (supported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      subscribed = Boolean(await reg?.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }
  return { supported, ios, standalone, permission: supported ? Notification.permission : "unsupported", subscribed };
}

export function IosInstallGuide() {
  return (
    <div className="space-y-3 rounded-lg border bg-surface p-4 text-sm">
      <p className="font-medium">On iPhone, notifications work once Command is on your Home Screen</p>
      <ol className="space-y-3">
        <li className="flex items-start gap-3">
          <Share className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <span>Open this page in <strong>Safari</strong> and tap the <strong>Share</strong> button (the square with an arrow) in the toolbar.</span>
        </li>
        <li className="flex items-start gap-3">
          <SquarePlus className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <span>Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</span>
        </li>
        <li className="flex items-start gap-3">
          <Bell className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <span>Open <strong>Command from your Home Screen</strong> (not Safari), go to <strong>Me → Notifications</strong>, and tap <strong>Turn on notifications</strong>.</span>
        </li>
      </ol>
      <p className="text-[13px] md:text-[12px] text-muted">Needs iOS 16.4 or newer.</p>
    </div>
  );
}

export function PushPanel({ vapidPublicKey, serverPermission, deviceCount }: { vapidPublicKey: string; serverPermission: string | null; deviceCount: number }) {
  const [env, setEnv] = useState<Env | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const e = await readEnv();
    setEnv(e);
    // Keep the server's picture accurate, and re-register if this browser is subscribed but the server lost it.
    if (e.supported && e.permission !== "default" && e.permission !== serverPermission) void post("/api/push/state", { permission: e.permission }).catch(() => undefined);
    if (e.supported && e.permission === "default" && serverPermission !== "default") void post("/api/push/state", { permission: "default" }).catch(() => undefined);
    if (e.supported && e.subscribed && deviceCount === 0) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) void post("/api/push/subscribe", sub.toJSON()).catch(() => undefined);
    }
  }, [deviceCount, serverPermission]);

  useEffect(() => {
    // Reading browser state after mount is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission(); // must follow a tap
      await post("/api/push/state", { permission });
      if (permission !== "granted") {
        toast.message(permission === "denied" ? "Notifications are blocked for this site." : "No problem. You can turn them on any time.");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await post("/api/push/subscribe", sub.toJSON());
      if (!res.ok) throw new Error("save failed");
      toast.success("Notifications are on for this device.");
    } catch {
      toast.error("We couldn't turn notifications on. Try again, or check your browser settings.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await post("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      toast.message("Notifications are off for this device.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await post("/api/push/test", {});
      const json = await res.json();
      if (json.ok) toast.success("Sent. It should arrive in a few seconds.");
      else toast.error(json.error ?? "The test didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  if (!env) return <p className="text-sm text-muted">Checking this device…</p>;
  if (env.ios && !env.standalone) return <IosInstallGuide />;
  if (!env.supported) return <p className="text-sm text-muted">This browser can&apos;t receive notifications. On Android use Chrome; on iPhone add Command to your Home Screen (iOS 16.4+).</p>;
  if (env.permission === "denied") {
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2"><BellOff className="size-4 text-muted" aria-hidden /> <Badge tone="warning">Blocked</Badge></p>
        <p className="text-muted">Notifications are blocked for this site. To turn them on, open your browser or phone settings, find this site (or the Command app), and set Notifications to Allow. Then come back here.</p>
      </div>
    );
  }
  if (env.subscribed && env.permission === "granted") {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm"><Bell className="size-4 text-success" aria-hidden /> <Badge tone="success">On for this device</Badge></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={test} disabled={busy}>Send me a test</Button>
          <Button variant="ghost" size="sm" onClick={disable} disabled={busy}>Turn off on this device</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Get a reminder to clock in on build days, a heads-up before events you&apos;re going to, and news when events change. You choose which ones below.</p>
      <Button onClick={enable} disabled={busy} size="lg">
        <Bell aria-hidden /> Turn on notifications
      </Button>
    </div>
  );
}
