import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { groupMembersOf, listGroups, peopleNotInGroup } from "@/lib/groups";
import { addMembersAction, createGroupAction, deleteGroupAction, removeMemberAction, updateGroupAction } from "./actions";

export const metadata: Metadata = { title: "Groups" };
export const dynamic = "force-dynamic";

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser({ min: "admin" });
  const { error } = await searchParams;
  const all = await listGroups();
  const detail = await Promise.all(all.map(async (g) => ({ g, members: await groupMembersOf(g.id), others: await peopleNotInGroup(g.id) })));
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted">
        Groups are sets of people you name, like &ldquo;Super scouts&rdquo; or &ldquo;Drivers&rdquo;. On a sign-up sheet you can reserve a shift for a group, or give a group first pick before it opens to everyone.
      </p>
      {error ? <p role="alert" className="rounded-[8px] bg-error-subtle p-3 text-sm text-error">{error.slice(0, 300)}</p> : null}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">New group</h2>
        <ActionForm action={createGroupAction} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" resetOnSuccess>
          <TextField name="name" label="Name" required maxLength={60} />
          <TextField name="description" label="What it's for (optional)" maxLength={300} />
          <SubmitButton pendingText="Creating…">Create group</SubmitButton>
        </ActionForm>
      </Card>

      {detail.length === 0 ? (
        <EmptyState icon={<Users aria-hidden />} title="No groups yet">Make your first group above, then add people to it.</EmptyState>
      ) : (
        detail.map(({ g, members, others }) => (
          <Card key={g.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{g.name}</h2>
                {g.description ? <p className="text-sm md:text-[13px] text-muted">{g.description}</p> : null}
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{g.memberCount} {g.memberCount === 1 ? "person" : "people"}</Badge>
                  {g.upcomingShifts > 0 ? <Badge tone="info">Reserved on {g.upcomingShifts} upcoming {g.upcomingShifts === 1 ? "shift" : "shifts"}</Badge> : null}
                </p>
              </div>
              <ConfirmAction
                label="Delete group"
                danger
                title={`Delete “${g.name}”?`}
                description="Everyone is taken out of the group. It can't be deleted while a shift is still reserved for it."
                confirmLabel="Delete group"
                action={deleteGroupAction}
                fields={{ id: g.id }}
              />
            </div>

            {members.length === 0 ? (
              <p className="text-sm md:text-[13px] text-muted">Nobody in this group yet.</p>
            ) : (
              <ul className="divide-y rounded-[8px] border">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{m.name} <span className="text-muted capitalize">· {m.role}</span></span>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="userId" value={m.id} />
                      <Button type="submit" size="sm" variant="ghost" aria-label={`Remove ${m.name} from ${g.name}`}>Remove</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {others.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Add people</summary>
                <form action={addMembersAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={g.id} />
                  <fieldset className="max-h-56 space-y-1 overflow-y-auto rounded-[8px] border p-3">
                    <legend className="sr-only">People to add to {g.name}</legend>
                    {others.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 py-1 text-sm">
                        <input type="checkbox" name="userIds" value={o.id} className="size-4 accent-[var(--accent)]" />
                        {o.name} <span className="text-muted capitalize">· {o.role}</span>
                      </label>
                    ))}
                  </fieldset>
                  <SubmitButton variant="secondary" pendingText="Adding…">Add selected</SubmitButton>
                </form>
              </details>
            ) : null}

            <details>
              <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Rename</summary>
              <ActionForm action={updateGroupAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <input type="hidden" name="id" value={g.id} />
                <TextField name="name" label="Name" defaultValue={g.name} required maxLength={60} />
                <TextField name="description" label="What it's for (optional)" defaultValue={g.description ?? ""} maxLength={300} />
                <SubmitButton variant="secondary" pendingText="Saving…">Save</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        ))
      )}
    </div>
  );
}
