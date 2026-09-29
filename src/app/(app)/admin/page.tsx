import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireUser({ min: "lead" });
  const admin = roleAtLeast(user.role, "admin");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle><Link href="/admin/review" className="underline-offset-4 hover:underline">Needs review</Link></CardTitle>
          <CardDescription>One inbox for requests that need a decision.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted">Join requests, parent link requests and flagged attendance appear here.</CardContent>
      </Card>
      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle><Link href="/admin/people" className="underline-offset-4 hover:underline">People</Link></CardTitle>
            <CardDescription>Roles, deactivation and password resets.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted">Everyone who has an account with your team.</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
