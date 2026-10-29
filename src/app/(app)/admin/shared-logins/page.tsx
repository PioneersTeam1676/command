import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { LoginForm } from "@/components/shared-logins/login-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { listGroups } from "@/lib/groups";
import { secretsConfigured } from "@/lib/secrets";
import { listLoginsForAdmin } from "@/lib/shared-logins";
import { createLoginAction, deleteLoginAction, updateLoginAction } from "./actions";

export const metadata: Metadata = { title: "Shared logins" };
export const dynamic = "force-dynamic";

export default async function SharedLoginsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser({ min: "admin" });
  const { error } = await searchParams;
  if (!secretsConfigured()) {
    return (
      <div className="space-y-4">
        <p role="alert" className="max-w-2xl rounded-lg bg-error-subtle p-3 text-sm text-error">
          Shared logins are turned off. Set <code>SHARED_LOGIN_KEY</code> on the server (generate one with <code>openssl rand -base64 32</code>) and restart. It encrypts the passwords and authenticator secrets, so keep a copy somewhere safe.
        </p>
      </div>
    );
  }
  const [logins, groups] = await Promise.all([listLoginsForAdmin(), listGroups()]);
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted">
        A login the team shares, like a team email account. People in the groups you pick see its email, password and a live authenticator code. Showing a password is recorded in the audit log. If someone leaves, change the password here: they have seen the old one.
      </p>
      {error ? <p role="alert" className="rounded-lg bg-error-subtle p-3 text-sm text-error">{error.slice(0, 300)}</p> : null}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">New shared login</h2>
        <LoginForm action={createLoginAction} groups={groups} submitLabel="Add shared login" resetOnSuccess />
      </Card>

      {logins.length === 0 ? (
        <EmptyState icon={<KeyRound aria-hidden />} title="No shared logins yet">Add the first one above.</EmptyState>
      ) : (
        logins.map((l) => (
          <Card key={l.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{l.label}</h2>
                <p className="text-sm md:text-[13px] text-muted">{l.email}</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {l.groups.length === 0 ? <Badge tone="warning">No groups: only admins can see it</Badge> : l.groups.map((g) => <Badge key={g.id}>{g.name}</Badge>)}
                </p>
              </div>
              <ConfirmAction
                label="Delete"
                danger
                title={`Delete “${l.label}”?`}
                description="Removes the stored password and authenticator secret. This can't be undone."
                confirmLabel="Delete shared login"
                action={deleteLoginAction}
                fields={{ id: l.id }}
              />
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Edit</summary>
              <div className="mt-3">
                <LoginForm action={updateLoginAction} groups={groups} initial={{ id: l.id, label: l.label, email: l.email, groupIds: l.groups.map((g) => g.id) }} submitLabel="Save" />
              </div>
            </details>
          </Card>
        ))
      )}
    </div>
  );
}
