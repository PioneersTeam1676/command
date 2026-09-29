import { AlertTriangle, Info, Lock } from "lucide-react";
import { OWNER_CONTACT, getEffectiveState } from "@/lib/registry";
import { cn } from "@/lib/utils";

const day = (ms: number) => Math.max(0, Math.ceil(ms / 86_400_000));

function Bar({ tone, icon, children }: { tone: "warning" | "error" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn("flex w-full items-start gap-3 border-b px-4 py-3 text-sm md:px-8", tone === "error" && "bg-error-subtle text-foreground", tone === "warning" && "bg-warning-subtle text-foreground", tone === "info" && "bg-info-subtle text-foreground")}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/**
 * Full-width notice about the license check (spec 9.3). Admins get exactly what happened and how to fix
 * it; everyone else just learns that the app is read-only. Nothing is shown while things are healthy.
 */
export async function RegistryBanner({ isAdmin }: { isAdmin: boolean }) {
  const s = await getEffectiveState();

  if (s.readOnly) {
    if (!isAdmin) {
      return (
        <Bar tone="error" icon={<Lock className="size-4" />}>
          <p><strong>Command is read-only right now.</strong> You can still see your data and download it, but clocking in and out and changes are paused. Please tell a team admin.</p>
        </Bar>
      );
    }
    return (
      <Bar tone="error" icon={<Lock className="size-4" />}>
        <p className="font-semibold">Command is read-only.</p>
        {s.state === "stopped_unreachable" ? (
          <p>It hasn&apos;t been able to reach the license registry for 7 days. Everyone can still view data and download exports, but nobody can clock in or out or change anything. <strong>To fix it:</strong> restore this server&apos;s internet access to the registry (Command recovers by itself at the next check), or contact {OWNER_CONTACT}.</p>
        ) : s.state === "stopped_integrity" ? (
          <p>It detected that its license-check code was changed, or that responses from the registry couldn&apos;t be trusted. Everyone can still view data and download exports. <strong>To fix it:</strong> restore the original files, or contact {OWNER_CONTACT}.</p>
        ) : (
          <p>The owner revoked this installation and the deadline has passed.{s.message ? ` Message from the owner: “${s.message}”` : ""} Everyone can still view data and download exports. Contact {OWNER_CONTACT}.</p>
        )}
      </Bar>
    );
  }

  if (!isAdmin) return null;

  if (s.state === "warning") {
    const left = day(s.msUntilStop ?? 0);
    return (
      <Bar tone="warning" icon={<AlertTriangle className="size-4" />}>
        <p className="font-semibold">Command can&apos;t reach the license registry.</p>
        <p>It has been {day(s.msSinceSuccess)} day{day(s.msSinceSuccess) === 1 ? "" : "s"} since the last successful check. Make sure this server can reach the internet. In {left} day{left === 1 ? "" : "s"} Command will become read-only (nobody could clock in or out; exports still work).</p>
      </Bar>
    );
  }
  if (s.state === "revoked") {
    const left = day(s.msUntilStop ?? 0);
    return (
      <Bar tone="warning" icon={<AlertTriangle className="size-4" />}>
        <p className="font-semibold">Action needed: this installation was revoked by the owner.</p>
        <p>{s.message ? `“${s.message}” ` : ""}Command becomes read-only on {s.revokeDeadline?.toISOString().slice(0, 10)} ({left} day{left === 1 ? "" : "s"} left). Contact {OWNER_CONTACT}.</p>
      </Bar>
    );
  }
  if (s.message) {
    return (
      <Bar tone="info" icon={<Info className="size-4" />}>
        <p><strong>Message from the Command owner:</strong> {s.message}</p>
      </Bar>
    );
  }
  return null;
}
