import { PushBanner } from "@/components/pwa/push-banner";
import { AppShell } from "@/components/shell/app-shell";
import { requireParent } from "@/lib/auth/current-user";
import { myDeviceCount } from "@/lib/push-devices";
import { getSettings } from "@/lib/settings";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireParent();
  const settings = await getSettings();
  const devices = await myDeviceCount(user.id);
  return (
    <AppShell teamName={settings.name} logoUrl={settings.logoPath ? "/api/logo" : null} leaderboardEnabled={false} isStaff={false} isParent banner={devices === 0 ? <PushBanner /> : undefined}>
      {children}
    </AppShell>
  );
}
