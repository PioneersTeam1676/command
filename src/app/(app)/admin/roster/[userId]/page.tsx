import { EmailText } from "@/components/email-text";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextAreaField, TextField } from "@/components/form-fields";
import { ConfirmAction } from "@/components/confirm-action";
import { HoursSummary, SessionBadges } from "@/components/session-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { countsTowardHours, formatDuration } from "@/lib/hours";
import { memberSessions } from "@/lib/roster";
import { getCurrentSeason, getSeason } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { formatInTz, toDatetimeLocal } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";
import { acceptSessionAction, rejectSessionAction } from "../../review/attendance-actions";
import { addTimeAction, deleteSessionAction, editTimesAction, forceClockOutAction } from "../actions";
import { Clock } from "lucide-react";
import { Textarea } from "@/components/ui/input";

export const metadata: Metadata = { title: "Member" };
export const dynamic = "force-dynamic";

export default async function MemberPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ season?: string }> }) {
  const me = await requireUser({ min: "lead" });
  const { userId } = await params;
  const { season: sp } = await searchParams;
  if (!uuidSchema.safeParse(userId).success) notFound();
  const [member] = await db.select().from(users).where(eq(users.id, userId));
  if (!member || member.role === "parent") notFound();
  const settings = await getSettings();
  const tz = settings.timezone;
  const season = (sp ? await getSeason(sp) : undefined) ?? (await getCurrentSeason());
  const sessions = await memberSessions(userId, season.id);
  const isAdmin = roleAtLeast(me.role, "admin");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/roster" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Roster</Link>
        <h2 className="mt-2 text-2xl font-semibold">{member.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm md:text-[13px] text-muted">
          <Badge className="capitalize">{member.role}</Badge>
          <Badge tone={member.status === "active" ? "success" : "neutral"} className="capitalize">{member.status}</Badge>
          {isAdmin ? <EmailText className="font-mono" email={member.email} /> : null}
        </p>
      </div>
      <HoursSummary
        sessions={sessions}
        tz={tz}
        seasonLabel={season.name}
        outreach={settings.outreachTrackingEnabled ? sessions.filter((s) => s.kind === "event" && s.isOutreach && s.reviewState !== "rejected" && s.reviewState !== "pending_approval").length : undefined}
      />

      {sessions.length === 0 ? (
        <EmptyState icon={<Clock />} title="No time recorded">Use “Add time” below if they were here but forgot to clock in.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {sessions.map((s) => {
              const counts = countsTowardHours(s);
              const flagged = s.reviewState === "needs_review" || s.reviewState === "pending_approval";
              return (
                <li key={s.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.kind === "event" ? (s.eventTitle ?? "Event") : "Build season clock-in"}{settings.outreachTrackingEnabled && s.isOutreach ? <Badge tone="info" className="ml-2 align-middle">Outreach</Badge> : null}</p>
                      <p className="font-mono text-[13px] md:text-[12px] text-muted">
                        {formatInTz(s.clockInAt, tz, "EEE MMM d, h:mm a")} – {s.clockOutAt ? formatInTz(s.clockOutAt, tz, "h:mm a") : "now"}
                        {s.clockOutAt ? ` · ${formatDuration(s.clockOutAt.getTime() - s.clockInAt.getTime())}` : ""}
                      </p>
                      {s.note ? <p className="mt-0.5 text-[13px] md:text-[12px] text-muted">“{s.note}”</p> : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={counts ? "success" : "neutral"}>{counts ? "Counts" : "Not counted"}</Badge>
                      <SessionBadges s={s} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status === "open" ? (
                      <ConfirmAction label="Clock out now" title={`Clock ${member.name} out now?`} description="This ends their open session at this moment." confirmLabel="Clock out" action={forceClockOutAction} fields={{ id: s.id, userId }} danger />
                    ) : (
                      <ConfirmAction label="Edit times" title="Edit this entry" description="It's marked as edited and logged." confirmLabel="Save" action={editTimesAction} fields={{ id: s.id, userId }}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1.5 text-sm font-medium">In<Input type="datetime-local" name="inAt" required defaultValue={toDatetimeLocal(s.clockInAt, tz)} /></label>
                          <label className="space-y-1.5 text-sm font-medium">Out<Input type="datetime-local" name="outAt" required defaultValue={s.clockOutAt ? toDatetimeLocal(s.clockOutAt, tz) : ""} /></label>
                        </div>
                        <p className="text-[13px] md:text-[12px] text-muted">Times are in {tz}.</p>
                      </ConfirmAction>
                    )}
                    {flagged ? (
                      <ConfirmAction label={s.reviewState === "pending_approval" ? "Approve" : "Accept as is"} variant="primary" title="Keep this entry as it is?" description="It will count toward their hours." confirmLabel="Accept" action={acceptSessionAction} fields={{ id: s.id }} />
                    ) : null}
                    {s.reviewState !== "rejected" && s.status !== "open" ? (
                      <ConfirmAction label="Don't count" danger title="Stop counting this entry?" description="It stays in the history but won't count toward their hours." confirmLabel="Don't count" action={rejectSessionAction} fields={{ id: s.id }}>
                        <Textarea name="reason" maxLength={200} aria-label="Reason (optional)" placeholder="Reason (optional)" />
                      </ConfirmAction>
                    ) : null}
                    {isAdmin ? (
                      <ConfirmAction label="Delete" danger title="Delete this entry permanently?" description="It's removed completely, along with its history. It leaves no record anywhere and can't be undone." confirmLabel="Delete permanently" action={deleteSessionAction} fields={{ id: s.id, userId }} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add time</CardTitle>
          <CardDescription>Use this when {member.name.split(" ")[0]} was here but didn&apos;t clock in. It counts right away and is recorded as added by you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={addTimeAction} resetOnSuccess className="space-y-4">
            <input type="hidden" name="userId" value={userId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="inAt" label="In" type="datetime-local" required help={`In ${tz}`} />
              <TextField name="outAt" label="Out" type="datetime-local" required />
            </div>
            <TextAreaField name="note" label="Note (optional)" maxLength={300} rows={2} />
            <SubmitButton pendingText="Adding…">Add time</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
