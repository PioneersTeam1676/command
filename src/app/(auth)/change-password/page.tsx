import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { changePasswordAction } from "../actions";

export const metadata: Metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-2xl font-semibold">{user.mustChangePassword ? "Choose your own password" : "Change password"}</h1>
        {user.mustChangePassword ? (
          <p className="mt-1 text-sm text-muted">You signed in with a temporary password. Pick a new one to continue.</p>
        ) : null}
        <ActionForm action={changePasswordAction} className="mt-5 space-y-4">
          <TextField name="current" label={user.mustChangePassword ? "Temporary password" : "Current password"} type="password" autoComplete="current-password" required />
          <TextField name="password" label="New password" type="password" autoComplete="new-password" required minLength={10} help="At least 10 characters." />
          <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
          <SubmitButton size="lg" className="w-full" pendingText="Saving…">
            Save password
          </SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
