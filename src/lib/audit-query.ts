import { aliasedTable, and, desc, eq, gte, ilike, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilter = { action?: string; actorId?: string; from?: string; to?: string; page?: number };

export async function queryAudit(f: AuditFilter) {
  const actor = aliasedTable(users, "actor");
  const conds = [];
  if (f.action) conds.push(ilike(auditLog.action, `${f.action.replace(/[%_\\]/g, "\\$&")}%`));
  if (f.actorId) conds.push(eq(auditLog.actorId, f.actorId));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(auditLog.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lt(auditLog.createdAt, new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000)));
  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, f.page ?? 1);
  const [rows, [count]] = await Promise.all([
    db
      .select({ a: auditLog, actorName: actor.name })
      .from(auditLog)
      .leftJoin(actor, eq(actor.id, auditLog.actorId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pages: Math.max(1, Math.ceil((count?.n ?? 0) / AUDIT_PAGE_SIZE)) };
}

export async function auditActors() {
  return db.selectDistinct({ id: users.id, name: users.name }).from(users).innerJoin(auditLog, eq(auditLog.actorId, users.id));
}
