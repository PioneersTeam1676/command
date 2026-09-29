/**
 * Push delivery seam. Phase 4 replaces this with real Web Push (see src/lib/push/*).
 * Returns the number of devices the message was delivered to.
 */
export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

export async function sendPushToUser(_userId: string, _payload: PushPayload): Promise<number> {
  return 0;
}
