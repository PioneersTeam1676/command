import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireParent } from "@/lib/auth/current-user";
import { RELATIONSHIPS, linksForParent } from "@/lib/parents";
import { logoutAction } from "../../(auth)/actions";
import { resubmitParentLinkAction } from "../../invite/parent/[token]/actions";

export const metadata: Metadata = { title: "Your students" };
export const dynamic = "force-dynamic";

const tone = { pending: "warning", needs_info: "info", approved: "success", denied: "error" } as const;
const text = { pending: "Waiting for review", needs_info: "More information needed", approved: "Approved", denied: "Not approved" } as const;

export default async function ParentHome() {
  const user = await requireParent();
  const links = (await linksForParent(user.id)).filter((l) => !l.revokedAt);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">You have read-only access to the students below once the team approves you.</p>
      </div>
      {links.length === 0 ? (
        <EmptyState icon={<Users />} title="No students linked yet">Ask your student to create a parent invite link from the Me page in Command, then open it.</EmptyState>
      ) : (
        links.map((l) => (
          <Card key={l.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-medium">{l.studentName}</p>
                <Badge tone={tone[l.status as keyof typeof tone]}>{text[l.status as keyof typeof text]}</Badge>
              </div>
              {l.status === "approved" ? (
                <Button asChild variant="secondary"><Link href={`/parent/${l.studentId}`}>View {l.studentName.split(" ")[0]}</Link></Button>
              ) : null}
              {l.adminMessage ? <p className="rounded-lg border bg-surface p-3 text-sm md:text-[13px]"><strong>Message from the team:</strong> {l.adminMessage}</p> : null}
              {l.status === "needs_info" ? (
                <ActionForm action={resubmitParentLinkAction} className="space-y-4 border-t pt-4">
                  <input type="hidden" name="linkId" value={l.id} />
                  <TextField name="fullName" label="Your full name" defaultValue={l.fullName} required />
                  <SelectField name="relationship" label="Relationship to the student" options={RELATIONSHIPS} defaultValue={l.relationship} />
                  <TextField name="phone" label="Phone (optional)" defaultValue={l.phone ?? ""} type="tel" />
                  <TextAreaField name="note" label="Note for the team (optional)" defaultValue={l.note ?? ""} maxLength={500} />
                  <SubmitButton pendingText="Sending…">Resubmit</SubmitButton>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
      {links.some((l) => l.status === "approved") ? (
        <Button asChild variant="secondary"><Link href="/parent/shifts">My shifts</Link></Button>
      ) : null}
      <form action={logoutAction}><Button type="submit" variant="ghost" size="sm">Sign out</Button></form>
    </div>
  );
}
