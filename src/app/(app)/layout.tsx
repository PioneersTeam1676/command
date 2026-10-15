import { PushBanner } from "@/components/pwa/push-banner";
import { PushPrompt } from "@/components/pwa/push-prompt";
import { RegistryBanner } from "@/components/registry/registry-banner";
import { AppShell } from "@/components/shell/app-shell";
import { pendingReviewCount } from "@/lib/admin-pending";
import { requireUser, isStaff, roleAtLeast } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { myDeviceCount } from "@/lib/push-devices";
import { getSettings } from "@/lib/settings";
import { isShopOpen } from "@/lib/shop-rules";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  const devices = await myDeviceCount(user.id);
  // A count that fails (for example a database that hasn't been migrated yet) must never take the whole app down.
  const adminCount = isStaff(user) ? await pendingReviewCount(roleAtLeast(user.role, "admin")).catch(() => 0) : 0;
  return (
    <AppShell
      teamName={settings.name}
      logoUrl={settings.logoPath ? "/api/logo" : null}
      leaderboardEnabled={getEnv().LEADERBOARD_ENABLED}
      isStaff={isStaff(user)}
      shopOpen={isShopOpen(settings)}
      me={{ name: user.name, avatarUrl: user.avatarUrl }}
      adminCount={adminCount}
      banner={
        <>
          <RegistryBanner isAdmin={roleAtLeast(user.role, "admin")} />
          {devices === 0 ? (
            <>
              <PushBanner />
              <PushPrompt vapidPublicKey={settings.vapidPublic ?? ""} />
            </>
          ) : null}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
