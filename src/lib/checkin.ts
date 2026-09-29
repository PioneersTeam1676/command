import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkinCodes } from "@/db/schema";
import { newSecret } from "@/lib/checkin-code";

/** The per-event secret. Created on first use by the display page; never sent to a client. */
export async function getCheckinSecret(eventId: string, create: boolean): Promise<string | null> {
  const [row] = await db.select().from(checkinCodes).where(eq(checkinCodes.eventId, eventId));
  if (row) return row.secret;
  if (!create) return null;
  await db.insert(checkinCodes).values({ eventId, secret: newSecret() }).onConflictDoNothing();
  const [created] = await db.select().from(checkinCodes).where(eq(checkinCodes.eventId, eventId));
  return created?.secret ?? null;
}
