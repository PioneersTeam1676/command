import { AppShell } from "@/components/shell/app-shell";
import { requireUser, isStaff } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <AppShell
      teamName={settings.name}
      logoUrl={settings.logoPath ? "/api/logo" : null}
      leaderboardEnabled={getEnv().LEADERBOARD_ENABLED}
      isStaff={isStaff(user)}
    >
      {children}
    </AppShell>
  );
}
