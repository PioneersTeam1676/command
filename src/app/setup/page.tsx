import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextField } from "@/components/form-fields";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LegalLinks } from "@/components/legal-doc";
import { Card, CardContent } from "@/components/ui/card";
import { GridBackground } from "@/components/ui/grid-background";
import { getCurrentUser } from "@/lib/auth/current-user";
import { googleAuthEnabled, smtpConfigured } from "@/lib/env";
import { readSettings } from "@/lib/settings";
import { adminExists, verifySetupToken } from "@/lib/setup";
import { cn } from "@/lib/utils";
import { createAdminAction, finishSetupAction, resumeAdminAction, saveTeamAction, submitTokenAction, testEmailAction } from "./actions";

export const metadata: Metadata = { title: "Set up Command" };
export const dynamic = "force-dynamic";

const STEPS = [
  { key: "token", label: "Token" },
  { key: "account", label: "Admin" },
  { key: "team", label: "Team" },
  { key: "email", label: "Email" },
  { key: "finish", label: "Finish" },
] as const;
type Step = (typeof STEPS)[number]["key"];

function timezones(): string[] {
  try {
    const list = Intl.supportedValuesOf("timeZone");
    return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    return ["UTC"];
  }
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const settings = await readSettings();
  if (settings.setupCompletedAt) notFound(); // /setup is gone after setup completes

  const ticket = (await cookies()).get("cmd_setup")?.value;
  const unlocked = Boolean(ticket && (await verifySetupToken(ticket)));
  const user = unlocked ? await getCurrentUser() : null;
  const isAdmin = Boolean(user && user.role === "admin" && user.status === "active");
  const hasAdmin = unlocked ? await adminExists() : false;

  const requested = ((await searchParams).step ?? "") as Step;
  let step: Step = !unlocked ? "token" : !isAdmin ? "account" : (STEPS.some((s) => s.key === requested) && requested !== "token" && requested !== "account" ? requested : "team");
  if (step === "email" && !smtpConfigured()) step = "finish";
  if (!unlocked && requested && requested !== "token") redirect("/setup");

  const visible = STEPS.filter((s) => s.key !== "email" || smtpConfigured());
  const idx = visible.findIndex((s) => s.key === step);
  const google = googleAuthEnabled();

  return (
    <GridBackground className="min-h-dvh px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-center text-[28px] font-semibold">Set up Command</h1>
        <ol className="mt-6 flex items-center justify-center gap-2 text-xs" aria-label="Setup progress">
          {visible.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2" aria-current={i === idx ? "step" : undefined}>
              <span className={cn("grid size-6 place-items-center rounded-full border font-mono", i <= idx ? "border-accent bg-accent text-accent-fg" : "text-muted")}>{i + 1}</span>
              <span className={i === idx ? "font-medium" : "text-muted"}>{s.label}</span>
              {i < visible.length - 1 ? <span aria-hidden className="h-px w-4 bg-border" /> : null}
            </li>
          ))}
        </ol>

        <Card className="mt-8">
          <CardContent className="p-6">
            {step === "token" && (
              <>
                <h2 className="text-lg font-semibold">Enter your setup token</h2>
                <p className="mt-1 text-sm text-muted">
                  When Command started, it printed a one-time token in its logs. Run <code className="font-mono text-[13px]">docker compose logs app</code> and copy the token. This stops anyone else from claiming a new install.
                </p>
                <ActionForm action={submitTokenAction} className="mt-5 space-y-4">
                  <TextField name="token" label="Setup token" autoComplete="off" spellCheck={false} required className="font-mono" />
                  <SubmitButton size="lg" className="w-full" pendingText="Checking…">Continue</SubmitButton>
                </ActionForm>
              </>
            )}

            {step === "account" && (
              <>
                <h2 className="text-lg font-semibold">{hasAdmin ? "Sign back in as admin" : "Create the first admin"}</h2>
                {hasAdmin ? (
                  <>
                    <p className="mt-1 text-sm text-muted">You already created an admin account in this setup. Sign in to keep going.</p>
                    <ActionForm action={resumeAdminAction} className="mt-5 space-y-4">
                      <TextField name="email" label="Email" type="email" autoComplete="email" required />
                      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
                      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">Continue</SubmitButton>
                    </ActionForm>
                    {google ? (
                      <div className="mt-4">
                        <GoogleButton intent="setup" recommended={false} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted">This person can manage everything. You can add more admins later.</p>
                    <div className="mt-5">
                      {google ? (
                        <>
                          <GoogleButton intent="setup" />
                          <OrDivider />
                        </>
                      ) : null}
                      <ActionForm action={createAdminAction} className="space-y-4">
                        <TextField name="name" label="Full name" autoComplete="name" required />
                        <TextField name="email" label="Email" type="email" autoComplete="email" required />
                        <TextField name="password" label="Password" type="password" autoComplete="new-password" required minLength={10} help="At least 10 characters." />
                        <TextField name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
                        <SubmitButton size="lg" className="w-full" pendingText="Creating…">Create admin</SubmitButton>
                      </ActionForm>
                    </div>
                  </>
                )}
              </>
            )}

            {step === "team" && (
              <>
                <h2 className="text-lg font-semibold">About your team</h2>
                <p className="mt-1 text-sm text-muted">You can change all of this later in Settings.</p>
                <ActionForm action={saveTeamAction} className="mt-5 space-y-4">
                  <TextField name="name" label="Team name" defaultValue={settings.name === "My Team" ? "" : settings.name} required maxLength={80} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="teamNumber" label="Team number (optional)" defaultValue={settings.teamNumber ?? ""} maxLength={20} inputMode="numeric" />
                    <TextField name="region" label="Region (optional)" defaultValue={settings.region ?? ""} maxLength={80} />
                  </div>
                  <SelectField
                    name="timezone"
                    label="Team timezone"
                    help="Schedules, reminders and “today” all use this timezone."
                    options={timezones()}
                    defaultValue={settings.timezone === "UTC" ? (process.env.TZ && timezones().includes(process.env.TZ) ? process.env.TZ : "UTC") : settings.timezone}
                  />
                  <TextField
                    name="domains"
                    label="Auto-approved email domains (optional)"
                    defaultValue={settings.allowedDomains.join(", ")}
                    placeholder="school.edu, team.org"
                    help="People who sign in with a verified email on one of these domains skip approval. Everyone else waits for an admin. Separate with commas."
                  />
                  <TextField name="accentColor" label="Accent color" type="color" defaultValue={settings.accentColor} className="[&_input]:h-11 [&_input]:p-1" help="Used for buttons and highlights. We'll adjust it if it would be hard to read." />
                  <TextField name="logo" label="Logo (optional)" type="file" accept="image/png,image/jpeg,image/webp" help="PNG, JPEG or WebP, up to 512 KB." />
                  <SubmitButton size="lg" className="w-full" pendingText="Saving…">Continue</SubmitButton>
                </ActionForm>
              </>
            )}

            {step === "email" && (
              <>
                <h2 className="text-lg font-semibold">Test your email</h2>
                <p className="mt-1 text-sm text-muted">Email is set up on this server. Send yourself a test so you know sign-up confirmations and reset links will arrive. You can skip this.</p>
                <ActionForm action={testEmailAction} className="mt-5 space-y-4">
                  <TextField name="to" label="Send a test to" type="email" defaultValue={user?.email} required />
                  <SubmitButton variant="secondary" size="lg" className="w-full" pendingText="Sending…">Send test email</SubmitButton>
                </ActionForm>
                <Link href="/setup?step=finish" className="mt-4 block text-center text-sm text-accent underline-offset-4 hover:underline">Continue</Link>
              </>
            )}

            {step === "finish" && (
              <>
                <h2 className="text-lg font-semibold">Before you finish</h2>
                <div className="mt-3 space-y-3 text-sm text-muted">
                  <p>
                    Command is <strong className="text-foreground">source-available, not open source</strong>. You may run it for your own team. See the{" "}
                    <Link href="/license" className="underline underline-offset-4">license</Link> for what is and isn&apos;t allowed.
                  </p>
                  <div className="rounded-[8px] border bg-surface p-3">
                    <p className="font-medium text-foreground">The registry check (required)</p>
                    <p className="mt-1">
                      As a condition of the license, Command registers with the owner&apos;s registry now and about once a day afterwards. It sends <em>only</em>: a random install ID, the Command version, your team name, team number and region, how many active members you have, and a build integrity value. It never sends names, emails, attendance or member lists. The registry keeps a one-way hash of your server&apos;s IP address for up to 30 days to detect misuse.
                    </p>
                    <p className="mt-1">If Command can&apos;t reach the registry for 7 days it becomes read-only (data export still works).</p>
                  </div>
                </div>
                <ActionForm action={finishSetupAction} className="mt-5 space-y-4">
                  <label className="flex min-h-[44px] items-start gap-3 text-sm">
                    <input type="checkbox" name="agree" className="mt-1 size-4 accent-[var(--accent)]" required />
                    <span>I&apos;ve read the license and the registry notice, and I agree to them.</span>
                  </label>
                  <SubmitButton size="lg" className="w-full" pendingText="Finishing…">Finish setup</SubmitButton>
                </ActionForm>
              </>
            )}
          </CardContent>
        </Card>
        <LegalLinks className="mt-6 text-center text-[13px] text-muted" />
      </div>
    </GridBackground>
  );
}
