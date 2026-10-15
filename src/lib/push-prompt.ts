export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowPushPrompt(i: {
  standalone: boolean;
  supported: boolean;
  ios: boolean;
  permission: NotificationPermission | "unsupported";
  snoozedUntil: number | null;
  now: number;
}): boolean {
  if (!i.standalone || !i.supported || i.permission !== "default") return false;
  if (typeof i.snoozedUntil === "number" && Number.isFinite(i.snoozedUntil) && i.snoozedUntil > i.now) return false;
  return true;
}

/** Dismissing the browser's own prompt leaves permission at "default"; snooze so the sheet doesn't return on every launch. */
export function snoozeAfterAsk(permission: NotificationPermission): boolean {
  return permission === "default";
}
