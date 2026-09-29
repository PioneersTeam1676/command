import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { InviteCreator } from "@/components/invite-creator";
import { LegalLinks } from "@/components/legal-doc";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { activeInvites as loadActiveInvites, linksForStudent } from "@/lib/parents";
import { logoutAction } from "../../(auth)/actions";
import { createInviteAction, revokeInviteAction, studentRevokeLinkAction } from "./actions";

export const metadata: Metadata = { title: "Me" };
export const dynamic = "force-dynamic";

const tone = { pending: "warning", needs_info: "info", approved: "success", denied: "error" } as const;
const label = { pending: "Waiting for review", needs_info: "Needs more info", approved: "Approved", denied: "Not approved" } as const;

export default async function MePage() {
  const user = await requireUser();
  const [activeInvites, links] = await Promise.all([loadActiveInvites(user.id), linksForStudent(user.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold">{user.name}</h1>
        <p className="mt-1 font-mono text-[13px] text-muted">{user.email}</p>
        <p className="mt-2"><Badge tone="accent" className="capitalize">{user.role}</Badge></p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>System follows your device&apos;s light or dark setting.</CardDescription>
        </CardHeader>
        <CardContent><ThemeToggle /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My hours</CardTitle>
          <CardDescription>See your time this season, and add time if you forgot to clock in.</CardDescription>
        </CardHeader>
        <CardContent><Button asChild variant="secondary"><Link href="/me/hours">View my hours</Link></Button></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Let a parent follow along</CardTitle>
          <CardDescription>
            Create a link and send it to your parent or guardian. After they sign up, a team admin approves them. They can only see your calendar, hours and attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InviteCreator action={createInviteAction} />
          {activeInvites.length > 0 ? (
            <ul className="divide-y rounded-[8px] border text-[13px]">
              {activeInvites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="text-muted">Link expires {format(i.expiresAt, "MMM d")} · used {i.usedCount}×</span>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" size="sm" variant="ghost">Revoke</Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          {links.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-medium">Parents</h3>
              <ul className="divide-y rounded-[8px] border text-[13px]">
                {links.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                    <span>
                      {l.fullName} <span className="text-muted">({l.relationship})</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={l.revokedAt ? "neutral" : tone[l.status as keyof typeof tone]}>{l.revokedAt ? "Removed" : label[l.status as keyof typeof label]}</Badge>
                      {!l.revokedAt ? (
                        <form action={studentRevokeLinkAction}>
                          <input type="hidden" name="id" value={l.id} />
                          <Button type="submit" size="sm" variant="ghost">Remove</Button>
                        </form>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href="/change-password">Change password</Link></Button>
          <form action={logoutAction}><Button type="submit" variant="secondary">Sign out</Button></form>
        </CardContent>
      </Card>

      <footer className="pt-4 text-center text-[12px] text-muted">
        <LegalLinks />
        <p className="mt-1">Powered by Command</p>
      </footer>
    </div>
  );
}
