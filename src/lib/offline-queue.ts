/**
 * Offline queue for clock taps (client-side only). Taps made without a connection are stored in
 * IndexedDB with the device timestamp and sent to /api/clock when we're back online: on the `online`
 * event, when the app returns to the foreground, and (where supported) via Background Sync from the
 * service worker. The server accepts the device time if it isn't in the future and is under 24 hours old.
 */

export type QueuedTap = {
  actionId: string;
  action: "in" | "out";
  kind: "open" | "event";
  eventId?: string;
  clientTime: string;
  label: string;
  note?: string;
  error?: string;
};

const DB = "command-offline";
const STORE = "taps";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "actionId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const newActionId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const listQueue = (): Promise<QueuedTap[]> => tx("readonly", (s) => s.getAll() as IDBRequest<QueuedTap[]>).then((r) => r.sort((a, b) => a.clientTime.localeCompare(b.clientTime)));
export const enqueueTap = (tap: QueuedTap) => tx("readwrite", (s) => s.put(tap)).then(() => undefined);
export const removeTap = (actionId: string) => tx("readwrite", (s) => s.delete(actionId)).then(() => undefined);

export type SyncOutcome = { synced: number; failed: { tap: QueuedTap; error: string }[]; stillOffline: boolean };

/** Send queued taps in the order they were made. Stops (keeping the rest) if the network drops again. */
export async function syncQueue(): Promise<SyncOutcome> {
  const out: SyncOutcome = { synced: 0, failed: [], stillOffline: false };
  for (const tap of await listQueue()) {
    let res: Response;
    try {
      res = await fetch("/api/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: tap.actionId, action: tap.action, kind: tap.kind, eventId: tap.eventId, clientTime: tap.clientTime, queued: true, note: tap.note }),
      });
    } catch {
      out.stillOffline = true;
      break;
    }
    if (res.status === 401) {
      out.stillOffline = true; // signed out: keep the taps until they sign in again
      break;
    }
    let json: { ok?: boolean; error?: string } = {};
    try {
      json = await res.json();
    } catch {
      out.stillOffline = true;
      break;
    }
    if (json.ok) {
      out.synced++;
      await removeTap(tap.actionId);
    } else {
      // The server said no (conflict, too old, ...). Tell the member once, then drop it.
      out.failed.push({ tap, error: json.error ?? "That tap couldn't be saved." });
      await removeTap(tap.actionId);
    }
  }
  return out;
}
