import { PushBanner } from "@/components/pwa/push-banner";
import { RegistryBanner } from "@/components/registry/registry-banner";
import { AppShell } from "@/components/shell/app-shell";
import { headers } from "next/headers";
import { getCurrentUser, requireUser, isStaff, roleAtLeast } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { myDeviceCount } from "@/lib/push-devices";
import { getSettings, isSetupComplete } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The home URL is public for signed-out visitors (the page renders the landing content itself).
  if ((await headers()).get("x-pathname") === "/" && (await isSetupComplete()) && !(await getCurrentUser())) return <>{children}</>;
  const user = await requireUser();
  const settings = await getSettings();
  const devices = await myDeviceCount(user.id);
  return (
    <AppShell
      teamName={settings.name}
      logoUrl={settings.logoPath ? "/api/logo" : null}
      leaderboardEnabled={getEnv().LEADERBOARD_ENABLED}
      isStaff={isStaff(user)}
      banner={
        <>
          <RegistryBanner isAdmin={roleAtLeast(user.role, "admin")} />
          {devices === 0 ? <PushBanner /> : null}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
