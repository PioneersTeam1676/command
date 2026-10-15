export const postJson = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask for permission (must run inside a tap), then subscribe and tell the server. Throws if subscribing or saving fails. */
export async function enablePush(vapidPublicKey: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  await postJson("/api/push/state", { permission });
  if (permission !== "granted") return permission;
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
  const res = await postJson("/api/push/subscribe", sub.toJSON());
  if (!res.ok) throw new Error("save failed");
  return permission;
}
