import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Card, CardContent } from "@/components/ui/card";
import { smtpConfigured } from "@/lib/env";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  const email = smtpConfigured();
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        {email ? (
          <>
            <p className="mt-1 text-sm text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
            <ActionForm action={forgotPasswordAction} className="mt-5 space-y-4">
              <TextField name="email" label="Email" type="email" autoComplete="email" required />
              <SubmitButton size="lg" className="w-full" pendingText="Sending…">
                Send reset link
              </SubmitButton>
            </ActionForm>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            This team doesn&apos;t send email, so an admin needs to reset your password. Ask them to open <strong>Admin → People</strong> and choose{" "}
            <strong>Reset password</strong>. They&apos;ll give you a temporary password.
          </p>
        )}
        <p className="mt-5 text-center text-sm md:text-[13px]">
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
