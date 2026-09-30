import { NextResponse } from "next/server";
import { hit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request";
import { shiftsIcs, userForFeedToken } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

/**
 * A person's shifts as a calendar feed they can subscribe to from Google Calendar, Apple Calendar or
 * Outlook. The secret in the address is the only credential (calendar apps can't sign in), so it's
 * revocable, rate-limited, and never lists anything but that one person's own shifts. Read-only, so it
 * keeps working when the instance is read-only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await hit(`feed:ip:${await clientIp()}`, 120, 600)).allowed) return new NextResponse("Too many requests.", { status: 429, headers: { "retry-after": "600" } });
  const { token } = await params;
  const user = await userForFeedToken(token);
  // Same answer whether the token never existed, was reset, or its owner was deactivated.
  if (!user) return new NextResponse("Not found.", { status: 404 });
  const ics = await shiftsIcs(user);
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="shifts.ics"',
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
