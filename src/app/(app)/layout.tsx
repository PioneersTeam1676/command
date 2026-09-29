import { PushBanner } from "@/components/pwa/push-banner";
import { RegistryBanner } from "@/components/registry/registry-banner";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser, isStaff, roleAtLeast } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { myDeviceCount } from "@/lib/push-devices";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
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
