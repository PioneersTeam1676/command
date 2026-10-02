import { EmailText } from "@/components/email-text";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Clock, MailCheck } from "lucide-react";
import { db } from "@/db";
import { accessRequests } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { smtpConfigured } from "@/lib/env";
import { logoutAction, resendVerificationAction } from "../actions";

export const metadata: Metadata = { title: "Waiting for approval" };
export const dynamic = "force-dynamic";

export default async function WaitingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "active") redirect("/");
  const [request] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.userId, user.id), eq(accessRequests.status, "pending")));
  const needsEmail = smtpConfigured() && !user.emailVerifiedAt;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        {needsEmail ? (
          <>
            <MailCheck className="size-6 text-muted" aria-hidden />
            <h1 className="text-2xl font-semibold">Check your email</h1>
            <p className="text-sm text-muted">
              We sent a confirmation link to <strong className="text-foreground"><EmailText email={user.email} /></strong>. Open it on this device to finish signing up.
            </p>
            <ActionForm action={async () => resendVerificationAction()} className="space-y-3">
              <SubmitButton variant="secondary" pendingText="Sending…">Send it again</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <Clock className="size-6 text-muted" aria-hidden />
            <h1 className="text-2xl font-semibold">Waiting for approval</h1>
            <p className="text-sm text-muted">
              {request
                ? "A team admin needs to approve your account. You can close this page and sign in later to check."
                : "Your account is set up. An admin will let you in soon."}
            </p>
            <Button asChild variant="secondary">
              <a href="/waiting">Check status</a>
            </Button>
          </>
        )}
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">Sign out</Button>
        </form>
      </CardContent>
    </Card>
  );
}
