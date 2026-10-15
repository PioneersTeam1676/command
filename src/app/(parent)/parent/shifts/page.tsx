import type { Metadata } from "next";
import Link from "next/link";
import { FeedCard } from "@/components/signups/feed-card";
import { MyShiftsView } from "@/components/signups/my-shifts-view";
import { requireParent } from "@/lib/auth/current-user";
import { feedStatus } from "@/lib/calendar-feed";
import { myShifts, openShiftsFor } from "@/lib/my-shifts";
import { getSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";
import { resetFeedAction, revokeFeedAction } from "../../../(app)/me/shifts/actions";

export const metadata: Metadata = { title: "My shifts" };
export const dynamic = "force-dynamic";

export default async function ParentShiftsPage() {
  const user = await requireParent();
  const [mine, open, feed, settings] = await Promise.all([myShifts(user.id, new Date(), user.role), openShiftsFor({ id: user.id, role: user.role }), feedStatus(user.id), getSettings()]);
  const tz = settings.timezone;
  return (
    <div className="space-y-8">
      <div>
        <Link href="/parent" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Back</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">My shifts</h1>
      </div>
      <MyShiftsView upcoming={mine.upcoming} past={mine.past} open={open} tz={tz} eventHref={(id) => `/parent/calendar/${id}`} />
      <FeedCard exists={feed.exists} lastUsedLabel={feed.exists && feed.lastFetchedAt ? formatInTz(feed.lastFetchedAt, tz, "MMM d, h:mm a") : null} reset={resetFeedAction} revoke={revokeFeedAction} />
    </div>
  );
}
