import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { googleAuthEnabled } from "@/lib/env";
import { safeNext } from "@/lib/form";
import { isSetupComplete } from "@/lib/settings";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const user = await getCurrentUser();
  if (user && user.status !== "deactivated" && user.status !== "denied") redirect("/");
  const sp = await searchParams;
  const flash = (await cookies()).get("cmd_flash")?.value;
  const next = safeNext(sp.next);
  const google = googleAuthEnabled();

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Welcome back.</p>
        {sp.reset ? <p role="status" className="mt-4 rounded-[8px] border bg-success-subtle p-3 text-sm md:text-[13px] text-success">Password updated. Sign in with your new password.</p> : null}
        {flash ? <p role="alert" className="mt-4 rounded-[8px] border bg-error-subtle p-3 text-sm md:text-[13px] text-error">{decodeURIComponent(flash)}</p> : null}
        <div className="mt-5">
          {google ? (
            <>
              <GoogleButton next={next} />
              <OrDivider />
            </>
          ) : null}
          <ActionForm action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <TextField name="email" label="Email" type="email" autoComplete="email" required />
            <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
            <SubmitButton size="lg" className="w-full" pendingText="Signing in…">
              Sign in
            </SubmitButton>
          </ActionForm>
        </div>
        <div className="mt-5 flex justify-between text-sm md:text-[13px]">
          <Link href="/forgot" className="text-muted underline-offset-4 hover:underline">Forgot password?</Link>
          <Link href="/signup" className="text-accent underline-offset-4 hover:underline">Create an account</Link>
        </div>
      </CardContent>
    </Card>
  );
}
