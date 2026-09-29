import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { confirmEmailAction } from "../../actions";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A button (not an auto-GET) so mail scanners that prefetch links can't consume the token. */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-2xl font-semibold">Confirm your email</h1>
        <p className="mt-1 text-sm text-muted">One tap to confirm this is your address.</p>
        <ActionForm action={confirmEmailAction} className="mt-5 space-y-4">
          <input type="hidden" name="token" value={token} />
          <SubmitButton size="lg" className="w-full" pendingText="Confirming…">
            Confirm email
          </SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
