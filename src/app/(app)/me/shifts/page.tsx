import type { Metadata } from "next";
import { MyShiftsView } from "@/components/signups/my-shifts-view";
import { requireUser } from "@/lib/auth/current-user";
import { myShifts, openShiftsFor } from "@/lib/my-shifts";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Sign-ups" };
export const dynamic = "force-dynamic";

export default async function MyShiftsPage() {
  const user = await requireUser();
  const [mine, open, settings] = await Promise.all([myShifts(user.id, new Date(), user.role), openShiftsFor({ id: user.id, role: user.role }), getSettings()]);
  const tz = settings.timezone;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sign-ups</h1>
      <MyShiftsView upcoming={mine.upcoming} past={mine.past} open={open} tz={tz} eventHref={(id) => `/calendar/${id}`} />
    </div>
  );
}
