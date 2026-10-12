import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
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
 * Admin-only notice about the license check (spec 9.3). It never limits the app; it just tells admins
 * what happened. Nothing is shown while things are healthy or when the check-in is turned off.
 */
export async function RegistryBanner({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return null;
  const s = await getEffectiveState();

  if (s.state === "warning") {
    const since = day(s.msSinceSuccess);
    return (
      <Bar tone="warning" icon={<AlertTriangle className="size-4" />}>
        <p className="font-semibold">Command can&apos;t reach the license registry.</p>
        <p>It has been {since} day{since === 1 ? "" : "s"} since the last successful check. Everything keeps working. Make sure this server can reach the internet, or turn the check-in off in <Link href="/admin/settings#license-check" className="underline underline-offset-4">Settings</Link>.</p>
      </Bar>
    );
  }
  if (s.state === "integrity") {
    return (
      <Bar tone="warning" icon={<AlertTriangle className="size-4" />}>
        <p className="font-semibold">License check problem.</p>
        <p>The license-check code was changed, or responses from the registry couldn&apos;t be trusted. Everything keeps working. Contact {OWNER_CONTACT} if you didn&apos;t expect this.</p>
      </Bar>
    );
  }
  if (s.state === "revoked") {
    return (
      <Bar tone="warning" icon={<AlertTriangle className="size-4" />}>
        <p className="font-semibold">This installation was revoked by the owner.</p>
        <p>{s.message ? `“${s.message}” ` : ""}Contact {OWNER_CONTACT}.</p>
      </Bar>
    );
  }
  if (s.message && s.state !== "disabled") {
    return (
      <Bar tone="info" icon={<Info className="size-4" />}>
        <p><strong>Message from the Command owner:</strong> {s.message}</p>
      </Bar>
    );
  }
  return null;
}
