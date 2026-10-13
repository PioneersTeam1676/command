import { EmailText } from "@/components/email-text";
import type { Metadata } from "next";
import { aliasedTable, desc, eq } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { db } from "@/db";
import { accessRequests, parentLinks, users } from "@/db/schema";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/input";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { approveAccessAction, decideParentAction, denyAccessAction } from "../actions";
import { acceptSessionAction, editSessionEndAction, rejectSessionAction, resolveOverlapAction } from "./attendance-actions";
import { overlapQueue, reviewQueue } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { formatDuration } from "@/lib/hours";
import { formatInTz, toDatetimeLocal } from "@/lib/time";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Needs review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await requireUser({ min: "lead" });
  const isAdmin = roleAtLeast(user.role, "admin");
  const settings = await getSettings();
  const tz = settings.timezone;
  const [attendance, overlapPairs] = await Promise.all([reviewQueue(), overlapQueue()]);
  const student = aliasedTable(users, "student");
  const [access, parents] = isAdmin ? await Promise.all([
    db
      .select({ id: accessRequests.id, note: accessRequests.note, createdAt: accessRequests.createdAt, name: users.name, email: users.email, verified: users.emailVerifiedAt })
      .from(accessRequests)
      .innerJoin(users, eq(users.id, accessRequests.userId))
      .where(eq(accessRequests.status, "pending"))
      .orderBy(desc(accessRequests.createdAt)),
    db
      .select({
        id: parentLinks.id,
        fullName: parentLinks.fullName,
        relationship: parentLinks.relationship,
        phone: parentLinks.phone,
        note: parentLinks.note,
        email: users.email,
        studentName: student.name,
      })
      .from(parentLinks)
      .innerJoin(users, eq(users.id, parentLinks.parentId))
      .innerJoin(student, eq(student.id, parentLinks.studentId))
      .where(eq(parentLinks.status, "pending")),
  ]) : [[], []];

  if (access.length === 0 && parents.length === 0 && attendance.length === 0 && overlapPairs.length === 0) {
    return (
      <EmptyState icon={<Inbox />} title="You're all caught up">
        New join requests, parent link requests, and overlapping time entries will show up here, and we&apos;ll send you a notification.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      {attendance.length > 0 ? (
        <section aria-labelledby="att-h">
          <h2 id="att-h" className="mb-3 text-base font-semibold tracking-tight">Attendance</h2>
          <div className="space-y-3">
            {attendance.map(({ session: a, userName, eventTitle }) => {
              const pendingBackfill = a.reviewState === "pending_approval";
              const ms = a.clockOutAt ? a.clockOutAt.getTime() - a.clockInAt.getTime() : 0;
              return (
                <Card key={a.id}>
                  <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 text-sm md:text-[13px]">
                      <p className="text-[15px] font-medium">{userName}</p>
                      <p className="text-muted">{a.kind === "event" ? (eventTitle ?? "Event") : "Build season clock-in"}</p>
                      <p className="font-mono text-muted">
                        {formatInTz(a.clockInAt, tz, "EEE MMM d, h:mm a")} – {a.clockOutAt ? formatInTz(a.clockOutAt, tz, "h:mm a") : "?"} · {formatDuration(ms)}
                      </p>
                      <p className="mt-1.5">
                        {pendingBackfill ? <><Badge tone="info">Manually added</Badge> <Badge tone="warning">Needs approval</Badge></> : <Badge tone="warning">Automatically clocked out, please check the end time</Badge>}
                      </p>
                      {a.note ? <p className="mt-2">“{a.note}”</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <ConfirmAction
                        label={pendingBackfill ? "Approve" : "Accept"}
                        variant="primary"
                        title={pendingBackfill ? `Approve ${userName}'s time?` : "Keep this time as it is?"}
                        description={pendingBackfill ? "It will count toward their hours." : "The automatic clock-out time stays and counts toward their hours."}
                        confirmLabel={pendingBackfill ? "Approve" : "Accept"}
                        action={acceptSessionAction}
                        fields={{ id: a.id }}
                      />
                      {a.clockOutAt ? (
                        <ConfirmAction label="Edit end time" title="Set the real end time" description="Use this if they left earlier. It's marked as edited." confirmLabel="Save" action={editSessionEndAction} fields={{ id: a.id }}>
                          <Input type="datetime-local" name="outAt" aria-label="End time" required defaultValue={toDatetimeLocal(a.clockOutAt, tz)} />
                          <p className="text-[13px] md:text-[12px] text-muted">Times are in {tz}.</p>
                        </ConfirmAction>
                      ) : null}
                      <ConfirmAction label={pendingBackfill ? "Deny" : "Reject"} danger title={`${pendingBackfill ? "Deny" : "Reject"} this time?`} description="It won't count toward their hours. They can still see it marked as not counted." confirmLabel={pendingBackfill ? "Deny" : "Reject"} action={rejectSessionAction} fields={{ id: a.id }}>
                        <Textarea name="reason" maxLength={200} aria-label="Reason (optional)" placeholder="Reason (optional)" />
                      </ConfirmAction>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {overlapPairs.length > 0 ? (
        <section aria-labelledby="ovl-h">
          <h2 id="ovl-h" className="text-base font-semibold tracking-tight">Overlapping time</h2>
          <p className="mb-3 mt-1 text-sm md:text-[13px] text-muted">The same person has two entries for the same stretch, usually a clock-in plus an event check-in. Hours are never counted twice, but pick how to tidy it up.</p>
          <div className="space-y-3">
            {overlapPairs.map(({ a, b, running }) => {
              const merge = !(a.kind === "event" && b.kind === "event");
              const entry = (e: typeof a, tag: string) => (
                <div className="min-w-0 rounded-lg border p-3">
                  <p className="text-[13px] md:text-[12px] font-medium uppercase tracking-wide text-muted">{tag}</p>
                  <p className="mt-1 truncate text-sm font-medium">{e.kind === "event" ? (e.eventTitle ?? "Event") : "Build season clock-in"}</p>
                  <p className="font-mono text-[13px] md:text-[12px] text-muted">
                    {formatInTz(e.clockInAt, tz, "EEE MMM d, h:mm a")} – {e.clockOutAt ? formatInTz(e.clockOutAt, tz, "h:mm a") : "now"}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {e.status === "open" ? <Badge tone="info">In progress</Badge> : null}
                    {e.origin === "backfill" ? <Badge tone="info">Manually added</Badge> : null}
                    {e.reviewState === "pending_approval" ? <Badge tone="warning">Needs approval</Badge> : null}
                  </p>
                </div>
              );
              const base = { aId: a.id, bId: b.id };
              return (
                <Card key={`${a.id}:${b.id}`}>
                  <CardContent className="space-y-4 p-5">
                    <p className="text-[15px] font-medium">{a.userName}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {entry(a, "Entry A")}
                      {entry(b, "Entry B")}
                    </div>
                    {running ? (
                      <p className="text-sm md:text-[13px] text-muted">One of these is still running. You can tidy it up once they clock out.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {merge ? (
                          <ConfirmAction label="Merge" variant="primary" title="Merge into one entry?" description="One entry from the earliest start to the latest end. The event entry is kept if there is one. The other is removed." confirmLabel="Merge" action={resolveOverlapAction} fields={{ ...base, action: "merge" }} />
                        ) : null}
                        <ConfirmAction label="Keep A" title="Keep entry A?" description="Entry B is removed. Entry A counts as it is." confirmLabel="Keep A" action={resolveOverlapAction} fields={{ ...base, action: "keep_a" }} />
                        <ConfirmAction label="Keep B" title="Keep entry B?" description="Entry A is removed. Entry B counts as it is." confirmLabel="Keep B" action={resolveOverlapAction} fields={{ ...base, action: "keep_b" }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {access.length > 0 ? (
        <section aria-labelledby="access-h">
          <h2 id="access-h" className="mb-3 text-base font-semibold tracking-tight">Join requests</h2>
          <div className="space-y-3">
            {access.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="truncate font-mono text-sm md:text-[13px] text-muted"><EmailText email={r.email} /></p>
                    <p className="mt-1">{r.verified ? <Badge tone="success">Email confirmed</Badge> : <Badge tone="warning">Email not confirmed</Badge>}</p>
                    {r.note ? <p className="mt-2 text-sm md:text-[13px]">“{r.note}”</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ConfirmAction
                      label="Approve"
                      variant="primary"
                      title={`Let ${r.name} in?`}
                      description="They'll be able to sign in right away. Choose what they can do."
                      confirmLabel="Approve"
                      action={approveAccessAction}
                      fields={{ id: r.id }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor={`role-${r.id}`}>Role</Label>
                        <Select id={`role-${r.id}`} name="role" defaultValue="member">
                          <option value="member">Member: can clock in and sign up</option>
                          <option value="lead">Lead: can also manage events and attendance</option>
                          <option value="admin">Admin: can manage everything</option>
                        </Select>
                      </div>
                    </ConfirmAction>
                    <ConfirmAction label="Deny" danger title={`Deny ${r.name}?`} description="They won't be able to sign in. They'll see your reason next time they try." confirmLabel="Deny" action={denyAccessAction} fields={{ id: r.id }}>
                      <div className="space-y-1.5">
                        <Label htmlFor={`reason-${r.id}`}>Reason (optional)</Label>
                        <Textarea id={`reason-${r.id}`} name="reason" maxLength={300} />
                      </div>
                    </ConfirmAction>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {parents.length > 0 ? (
        <section aria-labelledby="parent-h">
          <h2 id="parent-h" className="mb-3 text-base font-semibold tracking-tight">Parent link requests</h2>
          <div className="space-y-3">
            {parents.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 text-sm md:text-[13px]">
                    <p className="text-[15px] font-medium">{r.fullName} <span className="text-muted">({r.relationship})</span></p>
                    <p className="text-muted">wants to view <strong className="text-foreground">{r.studentName}</strong></p>
                    <p className="mt-1 font-mono text-muted"><EmailText email={r.email} />{r.phone ? ` · ${r.phone}` : ""}</p>
                    {r.note ? <p className="mt-2">“{r.note}”</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <ConfirmAction label="Approve" variant="primary" title="Approve this parent?" description={`${r.fullName} will be able to see ${r.studentName}'s calendar, hours and attendance (read-only).`} confirmLabel="Approve" action={decideParentAction} fields={{ id: r.id, decision: "approved" }} />
                    <ConfirmAction label="Ask for more info" title="What do you need from them?" description="They'll see your message and can update and resubmit." confirmLabel="Send request" action={decideParentAction} fields={{ id: r.id, decision: "needs_info" }}>
                      <Textarea name="message" required maxLength={500} aria-label="Message to the parent" />
                    </ConfirmAction>
                    <ConfirmAction label="Deny" danger title="Deny this request?" description="They won't see anything about the student. You can add a message they'll read." confirmLabel="Deny" action={decideParentAction} fields={{ id: r.id, decision: "denied" }}>
                      <Textarea name="message" maxLength={500} aria-label="Message to the parent (optional)" />
                    </ConfirmAction>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
