import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/scheduler";

/**
 * Seam between events and Google Calendar. In API mode, creating/editing/cancelling an event queues a
 * `gcal.push` job (retried with backoff if Google is unreachable). Otherwise this does nothing.
 */
export type EventChangeKind = "created" | "updated" | "cancelled";

export async function queueGcalPush(eventId: string, kind: EventChangeKind): Promise<void> {
  try {
    if (getEnv().GOOGLE_CALENDAR_MODE !== "api") return;
  } catch {
    return; // env not readable (tests): nothing to queue
  }
  await enqueue("gcal.push", { payload: { eventId, kind }, dedupeKey: `${eventId}:${kind}:${Date.now()}` });
}
