import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser, roleAtLeast } from "@/lib/auth/current-user";
import { hit } from "@/lib/auth/rate-limit";
import { exportAttendance, exportAudit, exportHours, exportMyHours, exportRsvps } from "@/lib/exports";
import { getCurrentSeason } from "@/lib/seasons";
import { readSettings } from "@/lib/settings";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ADMIN_KINDS = new Set(["hours", "attendance", "rsvps", "audit"]);

/**
 * CSV downloads. `my-hours` is for the signed-in member and (by design) is never blocked, even when the
 * instance is read-only. The rest are admin-only and are themselves written to the audit log.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await hit(`export:${user.id}`, 30, 600)).allowed) return NextResponse.json({ error: "Too many downloads. Wait a few minutes." }, { status: 429 });
  const { kind } = await params;
  const url = new URL(req.url);
  const settings = await readSettings();
  const seasonParam = url.searchParams.get("season");
  const seasonId = seasonParam && uuidSchema.safeParse(seasonParam).success ? seasonParam : (await getCurrentSeason()).id;

  if (kind === "my-hours") {
    if (user.role === "parent") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    return (await exportMyHours(user.id, seasonId, settings.timezone)) ?? NextResponse.json({ error: "Season not found." }, { status: 404 });
  }
  if (!ADMIN_KINDS.has(kind)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!roleAtLeast(user.role, "admin")) return NextResponse.json({ error: "Only admins can download this." }, { status: 403 });
  await audit({ actorId: user.id, action: `export.${kind}`, targetType: "export", after: { seasonId, query: Object.fromEntries(url.searchParams) } });

  const tz = settings.timezone;
  const res =
    kind === "hours"
      ? await exportHours(seasonId, tz)
      : kind === "attendance"
        ? await exportAttendance(seasonId, tz)
        : kind === "rsvps"
          ? await exportRsvps(seasonId, tz)
          : await exportAudit({
              from: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? new Date(`${url.searchParams.get("from")}T00:00:00Z`) : undefined,
              to: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? new Date(new Date(`${url.searchParams.get("to")}T00:00:00Z`).getTime() + 86_400_000) : undefined,
            });
  return res ?? NextResponse.json({ error: "Season not found." }, { status: 404 });
}
