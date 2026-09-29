import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextAreaField, TextField } from "@/components/form-fields";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { Card, CardContent } from "@/components/ui/card";
import { googleAuthEnabled, smtpConfigured } from "@/lib/env";
import { isSetupComplete } from "@/lib/settings";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!(await isSetupComplete())) redirect("/setup");
  const google = googleAuthEnabled();
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          {smtpConfigured()
            ? "Use your team or school email and we'll confirm it by email."
            : "A team admin will approve your account before you can use Command."}
        </p>
        <div className="mt-5">
          {google ? (
            <>
              <GoogleButton />
              <OrDivider />
            </>
          ) : null}
          <ActionForm action={signupAction} className="space-y-4">
            <TextField name="name" label="Full name" autoComplete="name" required />
            <TextField name="email" label="Email" type="email" autoComplete="email" required />
            <TextField name="password" label="Password" type="password" autoComplete="new-password" required minLength={10} help="At least 10 characters." />
            <TextAreaField name="note" label="Note for the admins (optional)" help="For example, which subteam you're on or who invited you." maxLength={500} />
            <SubmitButton size="lg" className="w-full" pendingText="Creating account…">
              Create account
            </SubmitButton>
          </ActionForm>
        </div>
        <p className="mt-4 text-center text-[13px] md:text-[12px] text-muted">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-4">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
        </p>
        <p className="mt-3 text-center text-sm md:text-[13px] text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent underline underline-offset-4">Sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
