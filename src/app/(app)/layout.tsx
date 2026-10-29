import { PushBanner } from "@/components/pwa/push-banner";
import { PushPrompt } from "@/components/pwa/push-prompt";
import { RegistryBanner } from "@/components/registry/registry-banner";
import { AppShell } from "@/components/shell/app-shell";
import { pendingReviewCount } from "@/lib/admin-pending";
import { requireUser, isStaff, roleAtLeast } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { myDeviceCount } from "@/lib/push-devices";
import { secretsConfigured } from "@/lib/secrets";
import { getSettings } from "@/lib/settings";
import { listLoginsFor } from "@/lib/shared-logins";
import { isShopOpen } from "@/lib/shop-rules";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  const devices = await myDeviceCount(user.id);
  // A count that fails (for example a database that hasn't been migrated yet) must never take the whole app down.
  const adminCount = isStaff(user) ? await pendingReviewCount(roleAtLeast(user.role, "admin")).catch(() => 0) : 0;
  // Like the count above, a failing lookup just hides the Logins entry.
  const hasLogins = secretsConfigured() ? (await listLoginsFor(user).catch(() => [])).length > 0 : false;
  return (
    <AppShell
      teamName={settings.name}
      logoUrl={settings.logoPath ? "/api/logo" : null}
      leaderboardEnabled={getEnv().LEADERBOARD_ENABLED}
      isStaff={isStaff(user)}
      shopOpen={isShopOpen(settings)}
      hasLogins={hasLogins}
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
