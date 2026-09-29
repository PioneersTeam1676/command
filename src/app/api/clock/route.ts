import { NextResponse } from "next/server";
import { z } from "zod";
import { clockInEvent, clockInOpen, clockOutEvent, clockOutOpen, runOnce, type Origin } from "@/lib/attendance";
import { hit } from "@/lib/auth/rate-limit";
import { isSameOrigin } from "@/lib/auth/request";
import { isReadOnly, ReadOnlyError } from "@/lib/registry";
import { getCurrentUser, roleAtLeast } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const body = z.object({
  actionId: z.string().min(8).max(80),
  action: z.enum(["in", "out"]),
  kind: z.enum(["open", "event"]),
  eventId: z.string().uuid().optional(),
  code: z.string().max(12).optional(),
  clientTime: z.union([z.string(), z.number()]).optional(),
  /** True for taps that were queued while offline and are being synced now. */
  queued: z.boolean().optional(),
});

/** Clock in/out for the signed-in member. Used by the Home screen, the check-in page and the offline sync. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, error: "Bad origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.mustChangePassword) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!roleAtLeast(user.role, "member")) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  if (!(await hit(`clock:${user.id}`, 60, 60)).allowed) return NextResponse.json({ ok: false, error: "Slow down a little and try again." }, { status: 429 });

  if (await isReadOnly()) return NextResponse.json({ ok: false, error: new ReadOnlyError().message, readOnly: true }, { status: 423 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  const b = parsed.data;
  if (b.kind === "event" && !b.eventId) return NextResponse.json({ ok: false, error: "Missing event." }, { status: 400 });

  const origin: Origin = b.queued ? "offline_synced" : "live";
  const timing = { now: new Date(), clientTime: b.clientTime ?? null };

  const result = await runOnce(user.id, b.actionId, async () => {
    const r =
      b.kind === "open"
        ? b.action === "in"
          ? await clockInOpen(user.id, timing, origin)
          : await clockOutOpen(user.id, timing, origin)
        : b.action === "in"
          ? await clockInEvent(user.id, b.eventId!, { ...timing, code: b.code }, origin)
          : await clockOutEvent(user.id, b.eventId!, timing, origin);
    if (!r.ok) return { ok: false as const, error: r.error, conflict: r.conflict ?? false };
    return { ok: true as const, autoClosed: "autoClosed" in r ? r.autoClosed : false, at: (b.action === "in" ? r.session.clockInAt : r.session.clockOutAt)?.toISOString() ?? null };
  });
  return NextResponse.json(result);
}
