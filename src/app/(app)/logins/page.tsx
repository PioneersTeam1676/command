import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { LoginCard } from "@/components/shared-logins/login-card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { secretsConfigured } from "@/lib/secrets";
import { listLoginsFor } from "@/lib/shared-logins";

export const metadata: Metadata = { title: "Shared logins" };
export const dynamic = "force-dynamic";

export default async function LoginsPage() {
  const user = await requireUser();
  const logins = secretsConfigured() ? await listLoginsFor(user) : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Shared logins</h1>
      <p className="max-w-2xl text-sm text-muted">
        Accounts your team shares. Copy the email, reveal the password, and use the code below it when the site asks for one. Showing a password is recorded in the audit log. Don&rsquo;t share these outside the team.
      </p>
      {logins.length === 0 ? (
        <EmptyState icon={<KeyRound aria-hidden />} title="Nothing shared with you yet">
          If you think you should have access, ask an admin to add you to the right group.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {logins.map((l) => (
            <LoginCard key={l.id} id={l.id} label={l.label} email={l.email} />
          ))}
        </div>
      )}
    </div>
  );
}
