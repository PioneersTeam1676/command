import type { Metadata } from "next";
import { format } from "date-fns";
import { ConfirmAction } from "@/components/confirm-action";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/users";
import { changeRoleAction, deactivateAction, deleteUserAction, eraseAction, reactivateAction, resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

const statusTone = { active: "success", pending: "warning", denied: "error", deactivated: "neutral" } as const;

export default async function PeoplePage() {
  const me = await requireUser({ min: "admin" });
  const all = await listUsers();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Everyone with an account. Members never see each other&apos;s email addresses; only admins see them here.</p>
      {all.map((u) => (
        <Card key={u.id} className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{u.name}</p>
              <p className="truncate font-mono text-sm md:text-[13px] text-muted">{u.email}</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={statusTone[u.status]} className="capitalize">{u.status}</Badge>
                <Badge className="capitalize">{u.role}</Badge>
                <span className="text-[13px] md:text-[12px] text-muted">Joined {format(u.createdAt, "MMM d, yyyy")}</span>
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <div className="flex flex-wrap gap-2">
                {u.role !== "parent" && u.status === "active" ? (
                  <form action={changeRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <Select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="h-9 w-32 min-h-9">
                      <option value="member">Member</option>
                      <option value="lead">Lead</option>
                      <option value="admin">Admin</option>
                    </Select>
                    <Button type="submit" size="sm" variant="secondary">Save role</Button>
                  </form>
                ) : null}
                {u.status === "active" ? (
                  <ConfirmAction label="Deactivate" title={`Deactivate ${u.name}?`} description="They'll be signed out everywhere and won't get notifications. Their past hours are kept for your records. You can reactivate them later." confirmLabel="Deactivate" action={deactivateAction} fields={{ id: u.id }} danger />
                ) : null}
                {u.status === "deactivated" ? (
                  <form action={reactivateAction}><input type="hidden" name="id" value={u.id} /><Button type="submit" size="sm" variant="secondary">Reactivate</Button></form>
                ) : null}
                {u.id !== me.id ? (
                  <ConfirmAction label="Erase data" title={`Permanently erase ${u.name}'s personal data?`} description="This removes their name, email, login and devices for good and can't be undone. Their attendance hours stay in season totals, but no longer show who they belong to. Use this when someone asks to be forgotten." confirmLabel="Erase permanently" action={eraseAction} fields={{ id: u.id }} danger />
                ) : null}
                {u.id !== me.id ? (
                  <ConfirmAction label="Delete" title={`Delete ${u.name}?`} description={u.role === "parent" ? "This deletes the parent account and their links to students. The students' own accounts are not affected. It can't be undone." : "This deletes the account and everything tied to it, including their attendance hours and RSVPs, for good. It can't be undone. To keep their hours, deactivate them instead."} confirmLabel="Delete permanently" action={deleteUserAction} fields={{ id: u.id }} danger />
                ) : null}
              </div>
              {u.status !== "denied" ? <ResetPasswordButton userId={u.id} action={resetPasswordAction} /> : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
