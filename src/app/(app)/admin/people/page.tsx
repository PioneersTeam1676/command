import { EmailText } from "@/components/email-text";
import type { Metadata } from "next";
import { format } from "date-fns";
import { ConfirmAction } from "@/components/confirm-action";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { getTechLeadId } from "@/lib/tech-lead";
import { listUsers } from "@/lib/users";
import { changeRoleAction, deactivateAction, deleteUserAction, eraseAction, reactivateAction, renameAction, resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

const statusTone = { active: "success", pending: "warning", denied: "error", deactivated: "neutral" } as const;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await requireUser({ min: "lead" });
  const techLeadId = await getTechLeadId();
  const isAdmin = roleAtLeast(me.role, "admin");
  const canRename = techLeadId === me.id;
  // Admins manage accounts; the tech lead (who may be a lead) only renames.
  if (!isAdmin && !canRename) redirect("/admin");
  const all = await listUsers();
  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="rounded-lg bg-error-subtle p-3 text-sm text-error">{error.slice(0, 200)}</p> : null}
      <p className="text-sm text-muted">
        Everyone with an account. Members never see each other&apos;s email addresses; only admins see them here.
        {canRename ? " You're the tech lead, so you can rename anyone." : null}
      </p>
      {all.map((u) => {
        const isTL = u.id === techLeadId;
        const erased = u.email.endsWith("@deleted.invalid");
        return (
          <Card key={u.id} className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{u.name}</p>
                {isAdmin ? <p className="truncate font-mono text-sm md:text-[13px] text-muted"><EmailText email={u.email} /></p> : null}
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone={statusTone[u.status]} className="capitalize">{u.status}</Badge>
                  <Badge className="capitalize">{u.role}</Badge>
                  {isTL ? <Badge tone="info">Tech lead</Badge> : null}
                  <span className="text-[13px] md:text-[12px] text-muted">Joined {format(u.createdAt, "MMM d, yyyy")}</span>
                </p>
              </div>
              <div className="flex flex-col gap-3 md:items-end">
                {canRename && !erased ? (
                  <form action={renameAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <Input name="name" defaultValue={u.name} required maxLength={100} aria-label={`New name for ${u.name}`} className="h-9 min-h-9 w-48" />
                    <Button type="submit" size="sm" variant="secondary">Rename</Button>
                  </form>
                ) : null}
                {isAdmin ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {u.role !== "parent" && u.status === "active" ? (
                        <form action={changeRoleAction} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={u.id} />
                          <Select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="h-9 w-32 min-h-9">
                            {isTL ? null : <option value="member">Member</option>}
                            <option value="lead">Lead</option>
                            <option value="admin">Admin</option>
                          </Select>
                          <Button type="submit" size="sm" variant="secondary">Save role</Button>
                        </form>
                      ) : null}
                      {u.status === "active" && !isTL ? (
                        <ConfirmAction label="Deactivate" title={`Deactivate ${u.name}?`} description="They'll be signed out everywhere and won't get notifications. Their past hours are kept for your records. You can reactivate them later." confirmLabel="Deactivate" action={deactivateAction} fields={{ id: u.id }} danger />
                      ) : null}
                      {u.status === "deactivated" ? (
                        <form action={reactivateAction}><input type="hidden" name="id" value={u.id} /><Button type="submit" size="sm" variant="secondary">Reactivate</Button></form>
                      ) : null}
                      {u.id !== me.id && !isTL ? (
                        <ConfirmAction label="Erase data" title={`Permanently erase ${u.name}'s personal data?`} description="Removes their name, email, login and devices. Can't be undone. Their hours stay in season totals but are no longer tied to them. Use this when someone asks to be forgotten." confirmLabel="Erase permanently" action={eraseAction} fields={{ id: u.id }} danger />
                      ) : null}
                      {u.id !== me.id && !isTL ? (
                        <ConfirmAction label="Delete" title={`Delete ${u.name}?`} description={u.role === "parent" ? "This deletes the parent account and their links to students. The students' own accounts are not affected. It can't be undone." : "This deletes the account and everything tied to it, including their attendance hours and sign-ups, for good. It can't be undone. To keep their hours, deactivate them instead."} confirmLabel="Delete permanently" action={deleteUserAction} fields={{ id: u.id }} danger />
                      ) : null}
                    </div>
                    {u.status !== "denied" ? <ResetPasswordButton userId={u.id} action={resetPasswordAction} /> : null}
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
