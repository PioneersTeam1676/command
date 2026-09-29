/**
 * Seam between events and Google Calendar. The Google Calendar phase replaces these with real
 * pushes (API mode). Kept separate so events.ts never imports googleapis.
 */
export type EventChangeKind = "created" | "updated" | "cancelled";

export async function queueGcalPush(_eventId: string, _kind: EventChangeKind): Promise<void> {}
