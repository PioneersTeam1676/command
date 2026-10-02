import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LegalLinks } from "@/components/legal-doc";
import { Card, CardContent } from "@/components/ui/card";
import { GridBackground } from "@/components/ui/grid-background";
import { getCurrentUser } from "@/lib/auth/current-user";
import { googleAuthEnabled } from "@/lib/env";
import { RELATIONSHIPS, resolveInvite } from "@/lib/parents";
import { isSetupComplete } from "@/lib/settings";
import { hit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request";
import { loginAction } from "../../../(auth)/actions";
import { parentSignupAction, submitParentDetailsAction } from "./actions";

export const metadata: Metadata = { title: "Parent invite", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isSetupComplete())) redirect("/setup");
  if (!(await hit(`invite-view:${await clientIp()}`, 60, 600)).allowed) return <Shell><p className="text-sm">Too many attempts. Please wait a few minutes.</p></Shell>;
  const invite = await resolveInvite(token);
  const user = await getCurrentUser();
  const path = `/invite/parent/${token}`;

  if (!invite) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-muted">It may have expired (links last 7 days) or been revoked. Ask the student to create a new one from their Me page.</p>
      </Shell>
    );
  }

  if (user && user.role !== "parent") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Use a parent account</h1>
        <p className="mt-2 text-sm text-muted">You&apos;re signed in with a team member account. Sign out, then open this link again to create a parent account.</p>
        <Link href="/me" className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline">Go to my account</Link>
      </Shell>
    );
  }

  if (user && user.role === "parent" && user.status === "active") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Tell us about you</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;re asking to view <strong className="text-foreground">{invite.studentName}</strong>&apos;s calendar, hours and attendance. A team admin will review this before you get access.
        </p>
        <ActionForm action={submitParentDetailsAction} className="mt-5 space-y-4">
          <input type="hidden" name="token" value={token} />
          <TextField name="fullName" label="Your full name" defaultValue={user.name} autoComplete="name" required />
          <SelectField name="relationship" label="Relationship to the student" options={RELATIONSHIPS} />
          <TextField name="phone" label="Phone (optional)" type="tel" autoComplete="tel" help="Only admins can see this." />
          <TextAreaField name="note" label="Note for the team (optional)" maxLength={500} />
          <SubmitButton size="lg" className="w-full" pendingText="Sending…">Send request</SubmitButton>
        </ActionForm>
      </Shell>
    );
  }

  const google = googleAuthEnabled();
  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Follow {invite.studentName}&apos;s team activity</h1>
      <p className="mt-1 text-sm text-muted">Create a parent account (or sign in) to ask for read-only access. Any email address works.</p>
      <div className="mt-5">
        {google ? (
          <>
            <GoogleButton intent="parent" next={path} />
            <OrDivider />
          </>
        ) : null}
        <h2 className="mb-3 text-base font-semibold">Create an account</h2>
        <ActionForm action={parentSignupAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <TextField name="name" label="Your full name" autoComplete="name" required />
          <TextField name="email" label="Email" type="email" autoComplete="email" required />
          <TextField name="password" label="Password" type="password" autoComplete="new-password" required minLength={10} help="At least 10 characters." />
          <SubmitButton size="lg" className="w-full" pendingText="Creating…">Create account</SubmitButton>
        </ActionForm>
        <details className="mt-6 rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">Already have a parent account? Sign in</summary>
          <ActionForm action={loginAction} className="mt-4 space-y-4">
            <input type="hidden" name="next" value={path} />
            <TextField name="email" label="Email" type="email" autoComplete="email" required />
            <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
            <SubmitButton variant="secondary" size="lg" className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
          </ActionForm>
        </details>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <GridBackground className="min-h-dvh px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardContent className="p-6">{children}</CardContent>
        </Card>
        <LegalLinks className="mt-6 text-center text-sm md:text-[13px] text-muted" />
      </div>
    </GridBackground>
  );
}
