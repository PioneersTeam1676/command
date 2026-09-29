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

export const metadata: Metadata = { title: "Needs review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await requireUser({ min: "lead" });
  if (!roleAtLeast(user.role, "admin")) {
    return <EmptyState icon={<Inbox />} title="Nothing for you here yet">Attendance items that need a lead&apos;s decision will show up here.</EmptyState>;
  }
  const student = aliasedTable(users, "student");
  const [access, parents] = await Promise.all([
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
  ]);

  if (access.length === 0 && parents.length === 0) {
    return (
      <EmptyState icon={<Inbox />} title="You're all caught up">
        New join requests and parent link requests will show up here, and we&apos;ll send you a notification.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      {access.length > 0 ? (
        <section aria-labelledby="access-h">
          <h2 id="access-h" className="mb-3 text-lg font-semibold">Join requests</h2>
          <div className="space-y-3">
            {access.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="truncate font-mono text-[13px] text-muted">{r.email}</p>
                    <p className="mt-1">{r.verified ? <Badge tone="success">Email confirmed</Badge> : <Badge tone="warning">Email not confirmed</Badge>}</p>
                    {r.note ? <p className="mt-2 text-[13px]">“{r.note}”</p> : null}
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
                          <option value="member">Member: can clock in and RSVP</option>
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
          <h2 id="parent-h" className="mb-3 text-lg font-semibold">Parent link requests</h2>
          <div className="space-y-3">
            {parents.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 text-[13px]">
                    <p className="text-[15px] font-medium">{r.fullName} <span className="text-muted">({r.relationship})</span></p>
                    <p className="text-muted">wants to view <strong className="text-foreground">{r.studentName}</strong></p>
                    <p className="mt-1 font-mono text-muted">{r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
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
