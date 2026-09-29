import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ActionForm, SubmitButton } from "@/components/form";
import { PrefSwitch } from "@/components/pref-switch";
import { PushPanel } from "@/components/pwa/push-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { getAttendingDays, getPrefs, listInbox } from "@/lib/notification-prefs";
import { typesForRole } from "@/lib/notification-types";
import { myDeviceCount } from "@/lib/push-devices";
import { getCurrentSeason } from "@/lib/seasons";
import { readSettings } from "@/lib/settings";
import { markAllReadAction, saveDaysAction, setPrefAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function NotificationsPage() {
  const user = await requireUser();
  const [settings, season, prefs, devices, inbox] = await Promise.all([readSettings(), getCurrentSeason(), getPrefs(user.id), myDeviceCount(user.id), listInbox(user.id)]);
  const attending = await getAttendingDays(user.id, season.workdays);
  const types = typesForRole(user.role);
  const unread = inbox.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-[13px] text-muted underline-offset-4 hover:underline">← Me</Link>
        <h1 className="mt-2 text-[28px] font-semibold">Notifications</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This device</CardTitle>
          <CardDescription>You can turn notifications on for each phone or computer you use.</CardDescription>
        </CardHeader>
        <CardContent>
          <PushPanel vapidPublicKey={settings.vapidPublic ?? ""} serverPermission={user.pushPermission} deviceCount={devices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What you get</CardTitle>
          <CardDescription>Your team decides when reminders go out. You decide which ones you want.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {types.map((t) => (
            <PrefSwitch key={t.key} type={t.key} label={t.label} description={t.description} enabled={prefs.get(t.key) ?? true} action={setPrefAction} />
          ))}
        </CardContent>
      </Card>

      {user.role !== "parent" && season.buildStart ? (
        <Card>
          <CardHeader>
            <CardTitle>Which build days do you come?</CardTitle>
            <CardDescription>Clock-in reminders only come on the days you pick. The team&apos;s workdays are shown; leave them all checked if you come every day.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveDaysAction} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {season.workdays.map((d) => (
                  <label key={d} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-subtle">
                    <input type="checkbox" name="days" value={d} defaultChecked={attending.has(d)} className="size-4 accent-[var(--accent)]" />
                    {DAYS[d]}
                  </label>
                ))}
              </div>
              <SubmitButton variant="secondary" pendingText="Saving…">Save days</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent</CardTitle>
            <CardDescription>{unread > 0 ? `${unread} new` : "Nothing new"}</CardDescription>
          </div>
          {unread > 0 ? (
            <form action={markAllReadAction}><Button type="submit" variant="ghost" size="sm">Mark all read</Button></form>
          ) : null}
        </CardHeader>
        <CardContent>
          {inbox.length === 0 ? (
            <p className="text-sm text-muted">Updates about events and requests will show up here.</p>
          ) : (
            <ul className="divide-y">
              {inbox.map((n) => (
                <li key={n.id} className="py-3">
                  <Link href={n.url ?? "#"} className="block">
                    <p className={`text-sm ${n.readAt ? "" : "font-medium"}`}>{n.title}</p>
                    {n.body ? <p className="text-[13px] text-muted">{n.body}</p> : null}
                    <p className="mt-0.5 font-mono text-[11px] text-muted">{formatDistanceToNow(n.createdAt, { addSuffix: true })}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
