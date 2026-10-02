import { format } from "date-fns";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "@/lib/form";
import { OWNER_CONTACT, registryOverview } from "@/lib/registry";

type Overview = Awaited<ReturnType<typeof registryOverview>>;

const LABEL = { ok: ["Working", "success"], warning: ["Warning", "warning"], revoked: ["Revoked", "warning"], stopped_unreachable: ["Read-only", "error"], stopped_integrity: ["Read-only", "error"] } as const;

/** The plain-language disclosure of the required license check (spec 9), with its current status. */
export function LicenseCard({ o, action }: { o: Overview; action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [label, tone] = LABEL[o.effective.state];
  return (
    <Card id="license-check">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">License check <Badge tone={tone}>{label}</Badge></CardTitle>
        <CardDescription>Command checks in with its owner&apos;s registry when it&apos;s set up and about once a day. This is required by the license so the owner can count the teams using Command.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-sm md:text-[13px] text-muted">Last successful check</dt><dd className="font-mono text-sm md:text-[13px]">{o.lastSuccessAt ? format(o.lastSuccessAt, "MMM d, yyyy h:mm a") : "Never"}</dd></div>
          <div><dt className="text-sm md:text-[13px] text-muted">Next check</dt><dd className="font-mono text-sm md:text-[13px]">{o.nextHeartbeatAt ? format(o.nextHeartbeatAt, "MMM d, h:mm a") : "Soon"}</dd></div>
          <div><dt className="text-sm md:text-[13px] text-muted">Version</dt><dd className="font-mono text-sm md:text-[13px]">{o.version}</dd></div>
          <div><dt className="text-sm md:text-[13px] text-muted">Checked files</dt><dd className="text-sm md:text-[13px]">{o.integrity.status === "ok" ? "Match this build" : o.integrity.status === "manifest_missing" ? "No build manifest (not a release build)" : `Changed: ${o.integrity.changed.join(", ")}`}</dd></div>
          <div><dt className="text-sm md:text-[13px] text-muted">Failed attempts in a row</dt><dd className="font-mono text-sm md:text-[13px]">{o.consecutiveFailures}</dd></div>
        </dl>
        {o.isPlaceholder ? <p className="rounded-lg border bg-warning-subtle p-3 text-sm md:text-[13px]">This build points at a placeholder registry address, so check-ins can&apos;t succeed yet. Release builds set the real address.</p> : null}
        {o.effective.message ? <p className="rounded-lg border bg-info-subtle p-3 text-sm md:text-[13px]"><strong>Message from the owner:</strong> {o.effective.message}</p> : null}

        <div className="rounded-lg border bg-surface p-4 text-sm md:text-[13px]">
          <p className="font-medium">Exactly what is sent</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted">
            <li>A random install ID and the Command version</li>
            <li>Your team name, team number and region</li>
            <li>How many active members you have (a number, not who they are)</li>
            <li>A fingerprint of the license-check files, a random one-time code and the time</li>
          </ul>
          <p className="mt-2 text-muted">Never sent: names, emails, hours, attendance or member lists. The registry keeps a one-way hash of your server&apos;s IP address for up to 30 days to detect misuse. If Command can&apos;t check in for 7 days it becomes read-only (data can still be viewed and exported). Questions: {OWNER_CONTACT}.</p>
        </div>

        <ActionForm action={action} className="space-y-3">
          <SubmitButton variant="secondary" pendingText="Checking…">Check now</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
