import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Card, CardContent } from "@/components/ui/card";
import { passwordResetTokenValid } from "@/lib/accounts";
import { resetPasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await passwordResetTokenValid(token);
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        {valid ? (
          <ActionForm action={resetPasswordAction} className="mt-5 space-y-4">
            <input type="hidden" name="token" value={token} />
            <TextField name="password" label="New password" type="password" autoComplete="new-password" required minLength={10} help="At least 10 characters." />
            <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
            <SubmitButton size="lg" className="w-full" pendingText="Saving…">
              Save password
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="mt-2 text-sm text-muted">
            This reset link has expired or was already used. <Link href="/forgot" className="text-accent underline-offset-4 hover:underline">Request a new one</Link>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
