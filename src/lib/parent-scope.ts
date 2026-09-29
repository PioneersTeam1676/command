import { and, eq, isNull } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { parentLinks, users } from "@/db/schema";

/**
 * The ONLY way parent-facing code may decide which student's data it can read.
 *
 * Every parent page, action and query must obtain a student id from `requireStudent` /
 * `approvedStudentIds`, never from a URL parameter directly. A link only counts when it is
 * `approved` and not revoked. Anything else answers exactly like a student that doesn't exist.
 */
export class ParentScopeError extends Error {
  constructor() {
    super("Student not found");
  }
}

type Reader = Pick<Db, "select">;

export async function approvedStudentIds(parentId: string, db: Reader = defaultDb): Promise<string[]> {
  const rows = await db
    .select({ studentId: parentLinks.studentId })
    .from(parentLinks)
    .innerJoin(users, eq(users.id, parentLinks.studentId))
    .where(and(eq(parentLinks.parentId, parentId), eq(parentLinks.status, "approved"), isNull(parentLinks.revokedAt), eq(users.status, "active")));
  return rows.map((r) => r.studentId);
}

/** Returns the student id if this parent is approved to view them, otherwise throws ParentScopeError. */
export async function requireStudent(parentId: string, studentId: string, db: Reader = defaultDb): Promise<string> {
  const ids = await approvedStudentIds(parentId, db);
  if (!ids.includes(studentId)) throw new ParentScopeError();
  return studentId;
}

/** Minimal, parent-safe view of a student: display name only. Never email or role. */
export async function studentDisplay(parentId: string, studentId: string, db: Reader = defaultDb) {
  await requireStudent(parentId, studentId, db);
  const [row] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, studentId));
  if (!row) throw new ParentScopeError();
  return row;
}
