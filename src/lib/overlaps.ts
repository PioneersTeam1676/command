/**
 * Overlap detection for one member's attendance. Pure, so it's cheap to test and safe to run on any page.
 *
 * Hours math already unions overlapping time (see hours.ts), so totals are never inflated. This exists so a human can
 * see the duplicate (clock-in plus event check-in for the same stretch) and tidy it up.
 *
 * Rejected rows never count as overlapping. A running session is treated as ending "now". Touching end-to-start is fine.
 */
export type OverlapRow = { id: string; userId: string; clockInAt: Date; clockOutAt: Date | null; reviewState: string };

export type OverlapPair<T extends OverlapRow = OverlapRow> = { a: T; b: T };

export function findOverlapPairs<T extends OverlapRow>(rows: readonly T[], now: Date = new Date()): OverlapPair<T>[] {
  const byUser = new Map<string, T[]>();
  for (const r of rows) {
    if (r.reviewState === "rejected") continue;
    const list = byUser.get(r.userId);
    if (list) list.push(r);
    else byUser.set(r.userId, [r]);
  }
  const out: OverlapPair<T>[] = [];
  for (const list of byUser.values()) {
    list.sort((x, y) => x.clockInAt.getTime() - y.clockInAt.getTime() || x.id.localeCompare(y.id));
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const aEnd = (a.clockOutAt ?? now).getTime();
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (b.clockInAt.getTime() >= aEnd) break; // sorted by start, so nothing later can overlap `a` either
        const bEnd = (b.clockOutAt ?? now).getTime();
        if (bEnd > b.clockInAt.getTime() && aEnd > a.clockInAt.getTime()) out.push({ a, b });
      }
    }
  }
  return out;
}

/** Ids of every row that overlaps at least one other row. */
export function overlappingIds(rows: readonly OverlapRow[], now?: Date): Set<string> {
  const ids = new Set<string>();
  for (const { a, b } of findOverlapPairs(rows, now)) {
    ids.add(a.id);
    ids.add(b.id);
  }
  return ids;
}
