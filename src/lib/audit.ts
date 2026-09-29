import { db, type Db } from "@/db";
import { auditLog } from "@/db/schema";

type Executor = Pick<Db, "insert">;

export type AuditEntry = {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
};

const REDACT = /password|token|secret|hash|key/i;

/** Strip anything that looks like a credential before it lands in the log. */
function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(scrub);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : scrub(v)]),
    );
  }
  return value;
}

/** Write an audit row. Pass a transaction as `tx` to make it atomic with the change it records. */
export async function audit(entry: AuditEntry, tx: Executor = db) {
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    before: scrub(entry.before) as never,
    after: scrub(entry.after) as never,
  });
}
