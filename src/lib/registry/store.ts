import { eq } from "drizzle-orm";
import { db } from "@/db";
import { registryState, users } from "@/db/schema";
import { and, inArray, sql } from "drizzle-orm";
import { readSettings } from "@/lib/settings";
import type { RegistrySnapshot, VerifiedStatus } from "./state";

export type RegistryRow = typeof registryState.$inferSelect;

export async function readRegistryRow(): Promise<RegistryRow> {
  const [row] = await db.select().from(registryState).where(eq(registryState.id, 1));
  if (row) return row;
  await db.insert(registryState).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(registryState).where(eq(registryState.id, 1));
  return created!;
}

export async function patchRegistry(patch: Partial<typeof registryState.$inferInsert>) {
  await readRegistryRow();
  await db.update(registryState).set(patch).where(eq(registryState.id, 1));
}

export async function snapshot(): Promise<RegistrySnapshot> {
  const [row, settings] = await Promise.all([readRegistryRow(), readSettings()]);
  return {
    referenceAt: row.registeredAt ?? settings.setupCompletedAt ?? row.lastAttemptAt ?? new Date(),
    lastSuccessAt: row.lastSuccessAt,
    consecutiveFailures: row.consecutiveFailures,
    verifiedStatus: (row.status as VerifiedStatus | "ok") === "ok" && !row.lastSuccessAt ? null : (row.status as VerifiedStatus),
    message: row.lastMessage,
    revokeDeadline: row.revokeDeadline,
    firstMismatchAt: row.firstMismatchAt,
    lastMismatchAt: row.lastMismatchAt,
    signatureFailures: row.signatureFailures,
    firstSignatureFailureAt: row.firstSignatureFailureAt,
    lastSignatureFailureAt: row.lastSignatureFailureAt,
    manifestMissing: row.manifestMissing,
  };
}

/** Active members (not parents), the only count we send. */
export async function activeMemberCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"])));
  return r?.n ?? 0;
}
